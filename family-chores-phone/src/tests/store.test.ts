import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as S from '../lib/store';
import { getPhoto } from '../lib/photos';
import { totalRewards } from '../lib/format';

const chore = (assignedTo: string, extra: Partial<S.ChoreInput> = {}): S.ChoreInput => ({
  title: 'Clean bedroom', description: 'Make the bed', assignedTo, rewardType: 'money', rewardAmount: 500, rewardNote: null, dueDate: null, ...extra,
});

async function family() {
  S._reset();
  localStorage.clear();
  await S.createHousehold('The Test Family', 'Morgan', '2468');
  const alex = S.addChild('Alex', 'teal');
  const jamie = S.addChild('Jamie', 'violet');
  const parentId = S.currentUser()!.id;
  return { alex, jamie, parentId };
}

describe('household and sign-in', () => {
  beforeEach(() => { S._reset(); localStorage.clear(); });

  it('creates a household with the parent signed in, and saves it on the device', async () => {
    await S.createHousehold('The Test Family', 'Morgan', '2468');
    expect(S.currentUser()?.role).toBe('parent');
    const saved = JSON.parse(localStorage.getItem('family-chores:data')!);
    expect(saved.household.name).toBe('The Test Family');
    expect(JSON.stringify(saved)).not.toContain('2468'); // PIN is hashed
  });

  it('needs the right parent PIN; children just pick their name', async () => {
    const { alex, parentId } = await family();
    S.signOut();
    await expect(S.signInAs(parentId, '0000')).rejects.toThrow('PIN');
    await expect(S.signInAs(parentId)).rejects.toThrow('PIN');
    await S.signInAs(alex.id);
    expect(S.currentUser()?.id).toBe(alex.id);
    await S.signInAs(parentId, '2468');
    expect(S.currentUser()?.role).toBe('parent');
  });

  it('rejects bad PINs and duplicate child names', async () => {
    await expect(S.createHousehold('X', 'Y', '12')).rejects.toThrow('4 to 6');
    await family();
    expect(() => S.addChild('alex', 'teal')).toThrow('already');
  });
});

describe('chore workflow', () => {
  it('runs assigned → submitted → needs changes → submitted → approved, recording the reward', async () => {
    const { alex, parentId } = await family();
    const c = S.createChore(chore(alex.id));
    S.signOut();
    await S.signInAs(alex.id);
    const photo = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    await S.submitChore(c.id, { photo, note: 'Done' });
    let cur = S.getState().data.chores.find((x) => x.id === c.id)!;
    expect(cur).toMatchObject({ status: 'submitted', hasPhoto: true, childNote: 'Done' });
    expect(await getPhoto(c.id)).toBeTruthy();
    await expect(S.submitChore(c.id, {})).rejects.toThrow('already');

    await S.signInAs(parentId, '2468');
    expect(() => S.reviewChore(c.id, false, '  ')).toThrow('Say what needs');
    S.reviewChore(c.id, false, 'Hoover too');
    expect(S.getState().data.chores.find((x) => x.id === c.id)).toMatchObject({ status: 'needs_changes', feedback: 'Hoover too' });

    await S.signInAs(alex.id);
    await S.submitChore(c.id, { note: 'Hoovered' });
    await S.signInAs(parentId, '2468');
    S.reviewChore(c.id, true);
    cur = S.getState().data.chores.find((x) => x.id === c.id)!;
    expect(cur.status).toBe('approved');
    expect(cur.approvedAt).toBeTruthy();
    expect(cur.hasPhoto).toBe(true); // the first photo is kept
    expect(totalRewards(S.getState().data.chores).moneyCents).toBe(500);
    expect(() => S.reviewChore(c.id, true)).toThrow('isn’t waiting');
  });

  it('a child can never approve, create, edit or delete chores', async () => {
    const { alex } = await family();
    const c = S.createChore(chore(alex.id));
    await S.signInAs(alex.id);
    await S.submitChore(c.id, {});
    expect(() => S.reviewChore(c.id, true)).toThrow('Only a parent');
    expect(() => S.createChore(chore(alex.id))).toThrow('Only a parent');
    await expect(S.updateChore(c.id, chore(alex.id, { rewardAmount: 100000 }))).rejects.toThrow('Only a parent');
    await expect(S.deleteChore(c.id)).rejects.toThrow('Only a parent');
    expect(() => S.addChild('Sam', 'teal')).toThrow('Only a parent');
  });

  it('a child can only hand in their own chores', async () => {
    const { alex, jamie } = await family();
    const c = S.createChore(chore(alex.id));
    await S.signInAs(jamie.id);
    await expect(S.submitChore(c.id, {})).rejects.toThrow('not found');
  });

  it('validates rewards and assignees', async () => {
    const { alex, parentId } = await family();
    expect(() => S.createChore(chore(alex.id, { rewardAmount: 0 }))).toThrow('amount');
    expect(() => S.createChore(chore(alex.id, { rewardType: 'screen_time', rewardAmount: 2000 }))).toThrow('minutes');
    expect(() => S.createChore(chore(alex.id, { rewardType: 'custom', rewardAmount: null, rewardNote: ' ' }))).toThrow('Describe');
    expect(() => S.createChore(chore(parentId))).toThrow('Choose who');
    const c = S.createChore(chore(alex.id, { rewardType: 'custom', rewardAmount: 5, rewardNote: 'Pick the film' }));
    expect(c.rewardAmount).toBeNull();
  });

  it('removing a child removes their chores', async () => {
    const { alex, jamie } = await family();
    S.createChore(chore(alex.id));
    S.createChore(chore(jamie.id));
    await S.removeChild(alex.id);
    expect(S.getState().data.chores.map((c) => c.assignedTo)).toEqual([jamie.id]);
  });
});

describe('demo', () => {
  it('loads The Smith Family with parent PIN 1234', async () => {
    S._reset();
    localStorage.clear();
    await S.loadDemo();
    const d = S.getState().data;
    expect(d.household?.name).toBe('The Smith Family');
    expect(d.members.map((m) => m.name)).toEqual(['Sarah', 'Alex', 'Jamie']);
    expect(d.chores.map((c) => c.title)).toEqual(expect.arrayContaining(['Clean bedroom', 'Take out bins', 'Feed the dog']));
    await S.signInAs(d.members[0].id, '1234');
    expect(S.currentUser()?.name).toBe('Sarah');
  });
});
