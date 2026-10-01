import type { CategoryId, HabitTemplate, TrackingMode } from '../models/types';
import { categoryById } from './categories';

type Opts = Partial<Pick<HabitTemplate, 'unit' | 'alternatives' | 'guidance' | 'caution' | 'milestones' | 'icon'>> & {
  modes?: TrackingMode[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

let order = 0;
function t(category: CategoryId, name: string, suggestedMode: TrackingMode, description: string, opts: Opts = {}): HabitTemplate {
  const modes = Array.from(new Set<TrackingMode>([suggestedMode, ...(opts.modes ?? defaultModes(suggestedMode)), 'observation']));
  return {
    id: `${category}-${slug(name)}`,
    name,
    category,
    description,
    icon: opts.icon ?? categoryById(category).icon,
    suggestedMode,
    modes,
    unit: opts.unit,
    alternatives: opts.alternatives,
    guidance: opts.guidance,
    caution: opts.caution,
    milestones: opts.milestones,
    addedOrder: order++,
  };
}

function defaultModes(mode: TrackingMode): TrackingMode[] {
  switch (mode) {
    case 'abstinence':
      return ['abstinence', 'frequency'];
    case 'frequency':
      return ['frequency', 'abstinence', 'replacement'];
    case 'time':
      return ['time', 'frequency'];
    case 'quantity':
      return ['quantity', 'frequency'];
    case 'replacement':
      return ['replacement', 'frequency'];
    default:
      return ['observation', 'frequency'];
  }
}

const SUBSTANCE_CAUTION =
  'Stopping some substances suddenly can cause withdrawal that needs medical supervision. Talk to a doctor, pharmacist or local support service before making big changes. This app is a tracking tool, not medical advice.';
const NICOTINE_GUIDANCE =
  'Nicotine cravings usually rise and fall within minutes. Many people find it easier with support — stop-smoking services and nicotine replacement are widely available and often free. Ask a pharmacist or doctor what suits you.';
const EATING_GUIDANCE =
  'Focus on regular, comfortable nourishment and noticing patterns — not restriction. If eating feels distressing or out of control, an eating-disorder support line or a doctor can help.';
const REFLECT_GUIDANCE =
  'This is for self-reflection, not diagnosis. If a pattern is causing you significant distress, talking to someone you trust or a mental-health professional can help.';

export const HABIT_TEMPLATES: HabitTemplate[] = [
  // 5.1 Digital and online habits
  t('digital', 'Excessive social media use', 'time', 'Time spent on social media apps beyond what you would like.', { alternatives: ['Read a few pages', 'Message a friend directly', 'Take a short walk'], icon: 'smartphone' }),
  t('digital', 'Doomscrolling', 'time', 'Scrolling through negative or endless feeds longer than intended.', { alternatives: ['Put the phone in another room', 'Write down one thing you can act on', 'Listen to music'] }),
  t('digital', 'Excessive phone use', 'time', 'Overall phone time that crowds out things you value.', { guidance: 'This app cannot read your screen time. Check your phone’s built-in screen-time report and log the total here.' }),
  t('digital', 'Excessive gaming', 'time', 'Gaming sessions that run longer than you planned or push out other priorities.', { alternatives: ['Practise an instrument', 'Go outside for ten minutes'], icon: 'gamepad' }),
  t('digital', 'Watching too much YouTube', 'time', 'Video watching that runs past the time you meant to spend.', { icon: 'tv' }),
  t('digital', 'Binge-watching television', 'time', 'Watching episode after episode longer than intended.', { icon: 'tv' }),
  t('digital', 'Excessive pornography use', 'frequency', 'Pornography use that you personally find unwanted or disruptive. You define the goal.', { modes: ['frequency', 'abstinence', 'time'], guidance: 'Sexuality is a normal part of life. Set boundaries that reflect your own values and wellbeing, not anyone else’s judgement.' }),
  t('digital', 'Compulsive sexual content consumption', 'frequency', 'Consuming sexual content in a way that feels compulsive or interferes with daily life.', { modes: ['frequency', 'abstinence', 'time'], guidance: 'Focus on the impact on your life and your own boundaries. A counsellor can help if this causes distress.' }),
  t('digital', 'Excessive online shopping', 'quantity', 'Browsing or buying online more than you want to.', { unit: 'purchases', modes: ['quantity', 'frequency', 'time'] }),
  t('digital', 'Constantly checking notifications', 'frequency', 'Checking for notifications many times an hour.', { alternatives: ['Turn on a focus mode', 'Batch-check at set times'] }),
  t('digital', 'Using a phone before bed', 'abstinence', 'Screen use in the last part of the evening before sleep.', { modes: ['abstinence', 'time'], icon: 'moon' }),
  t('digital', 'Staying up late browsing', 'abstinence', 'Browsing past the time you meant to go to bed.', { modes: ['abstinence', 'time'] }),
  t('digital', 'Internet procrastination', 'time', 'Browsing to avoid something you need to do.', { alternatives: ['Do the first two minutes of the task'] }),
  t('digital', 'Constantly switching between apps', 'frequency', 'Jumping between apps without settling on one task.'),
  t('digital', 'Seeking validation through likes and comments', 'observation', 'Checking reactions to posts for reassurance.', { modes: ['observation', 'frequency'] }),

  // 5.2 Smoking and potentially addictive habits
  t('substances', 'Smoking cigarettes', 'frequency', 'Track cigarettes, cravings and triggers towards a reduction or quitting goal you choose.', { modes: ['frequency', 'abstinence'], guidance: NICOTINE_GUIDANCE, icon: 'cigarette', alternatives: ['Drink a glass of water', 'Chew gum', 'Take a short walk'] }),
  t('substances', 'Vaping nicotine', 'frequency', 'Track vaping sessions and cravings.', { modes: ['frequency', 'abstinence'], guidance: NICOTINE_GUIDANCE, icon: 'cigarette' }),
  t('substances', 'Using nicotine pouches', 'frequency', 'Track pouches used and cravings.', { modes: ['frequency', 'abstinence'], guidance: NICOTINE_GUIDANCE, icon: 'cigarette' }),
  t('substances', 'Excessive caffeine consumption', 'quantity', 'Track caffeinated drinks and when you have them.', { unit: 'drinks', icon: 'coffee', guidance: 'Logging the time of each drink helps you see whether late caffeine affects your sleep.' }),
  t('substances', 'Compulsive gambling', 'frequency', 'Track gambling frequency, time and — optionally — money spent.', { modes: ['frequency', 'abstinence', 'time', 'quantity'], unit: 'money spent', icon: 'dice', guidance: 'Gambling support services and self-exclusion schemes exist in many countries and are free and confidential. Blocking software and bank gambling blocks can also help.' }),
  t('substances', 'Alcohol use I want to reduce', 'quantity', 'Track drinks against a limit you set.', { unit: 'drinks', modes: ['quantity', 'abstinence', 'frequency'], icon: 'wine', caution: 'If you drink heavily every day, stopping suddenly can be dangerous. Speak to a doctor before cutting down sharply.' }),
  t('substances', 'Recreational drug use I want to reduce or stop', 'frequency', 'Track use and situations around it, towards a goal you define.', { modes: ['frequency', 'abstinence'], caution: SUBSTANCE_CAUTION, icon: 'pill' }),
  t('substances', 'Prescription medication misuse', 'observation', 'Notice when use differs from what was prescribed.', { modes: ['observation', 'frequency', 'abstinence'], caution: 'Never stop or change prescribed medication without talking to your prescriber — some medicines are dangerous to stop suddenly.', icon: 'pill' }),
  t('substances', 'Compulsive pornography use', 'frequency', 'Pornography use that feels compulsive to you.', { modes: ['frequency', 'abstinence', 'time'], guidance: 'Focus on your own boundaries and wellbeing rather than guilt. A counsellor can help if it causes distress.' }),
  t('substances', 'Masturbation I consider unwanted or disruptive', 'frequency', 'Only if you personally want to change this; masturbation is a normal behaviour for many people.', { modes: ['frequency', 'abstinence', 'observation'], guidance: 'There is nothing inherently wrong with masturbation. Use this only for goals that reflect your own values and wellbeing.' }),

  // 5.3 Productivity and discipline
  t('productivity', 'Procrastination', 'replacement', 'Delaying tasks you intend to do. Track starts and completed focus blocks.', { alternatives: ['Start a 15-minute focus session', 'Write the very next step'] }),
  t('productivity', 'Frequently missing deadlines', 'frequency', 'Deadlines that slip past.'),
  t('productivity', 'Avoiding difficult tasks', 'replacement', 'Putting off hard tasks. Count the times you start one anyway.'),
  t('productivity', 'Checking messages while working', 'frequency', 'Breaking focus to check messages.'),
  t('productivity', 'Excessive multitasking', 'observation', 'Juggling several things at once and finishing none.'),
  t('productivity', 'Leaving tasks unfinished', 'replacement', 'Count tasks you carry through to done.'),
  t('productivity', 'Poor time management', 'observation', 'Notice where the day goes before changing it.', { modes: ['observation', 'replacement'] }),
  t('productivity', 'Staying up late instead of completing priorities', 'abstinence', 'Late nights spent on other things while priorities wait.'),
  t('productivity', 'Perfectionism that prevents starting', 'replacement', 'Count the times you start with a “good enough” first draft.', { icon: 'pen' }),
  t('productivity', 'Making plans but not following through', 'replacement', 'Count plans you follow through on.'),
  t('productivity', 'Frequently abandoning projects', 'replacement', 'Count sessions spent on a project you want to finish.'),
  t('productivity', 'Avoiding responsibilities', 'replacement', 'Count responsibilities you handle instead of postponing.'),

  // 5.4 Sleep
  t('sleep', 'Going to bed too late', 'abstinence', 'Going to bed later than your chosen bedtime.', { guidance: 'Pick a bedtime that fits your life — there is no single right time.' }),
  t('sleep', 'Inconsistent sleep schedule', 'observation', 'Bed and wake times that vary a lot from day to day.', { modes: ['observation', 'replacement'] }),
  t('sleep', 'Using screens immediately before sleep', 'abstinence', 'Screens in the last part of the evening.', { modes: ['abstinence', 'time'] }),
  t('sleep', 'Repeatedly hitting snooze', 'frequency', 'Pressing snooze several times each morning.', { icon: 'alarm' }),
  t('sleep', 'Staying awake gaming', 'abstinence', 'Late-night gaming past your bedtime.', { icon: 'gamepad' }),
  t('sleep', 'Caffeine too late in the day', 'abstinence', 'Caffeine after your own cut-off time.', { icon: 'coffee' }),
  t('sleep', 'Skipping a wind-down routine', 'replacement', 'Count evenings you follow a calming wind-down routine.'),
  t('sleep', 'Sacrificing sleep for entertainment', 'observation', 'Notice when entertainment pushes back sleep.', { modes: ['observation', 'abstinence'] }),

  // 5.5 Eating
  t('eating', 'Frequently skipping meals', 'replacement', 'Count regular meals you have — aim for steady nourishment.', { guidance: EATING_GUIDANCE }),
  t('eating', 'Eating while distracted by screens', 'observation', 'Notice meals eaten in front of a screen.', { modes: ['observation', 'replacement'], guidance: EATING_GUIDANCE }),
  t('eating', 'Eating past comfortable fullness', 'observation', 'Notice when and why meals go past comfortable fullness — without judgement.', { modes: ['observation'], guidance: EATING_GUIDANCE }),
  t('eating', 'Frequent unplanned snacking', 'observation', 'Notice unplanned snacks and what was going on — no food is “bad”.', { modes: ['observation', 'frequency'], guidance: EATING_GUIDANCE }),
  t('eating', 'Relying heavily on takeaway food', 'frequency', 'Takeaway meals more often than you would like.', { modes: ['frequency', 'replacement'], guidance: EATING_GUIDANCE }),
  t('eating', 'Frequently drinking sugary drinks', 'quantity', 'Track sugary drinks if you want to swap some for alternatives.', { unit: 'drinks', guidance: EATING_GUIDANCE }),
  t('eating', 'Eating irregularly because of a busy schedule', 'replacement', 'Count regular meals and planned snacks on busy days.', { guidance: EATING_GUIDANCE }),
  t('eating', 'Using food as the main response to stress', 'observation', 'Notice when stress and eating go together, and what else helps.', { modes: ['observation', 'replacement'], guidance: EATING_GUIDANCE }),
  t('eating', 'Ignoring hunger or fullness cues', 'observation', 'Practise noticing hunger and fullness.', { modes: ['observation', 'replacement'], guidance: EATING_GUIDANCE }),

  // 5.6 Physical activity and routines
  t('activity', 'Sitting for long periods without breaks', 'replacement', 'Count movement breaks during long sitting stretches.', { alternatives: ['Stand and stretch for two minutes'] }),
  t('activity', 'Spending nearly all free time indoors', 'replacement', 'Count times you spend a little time outdoors.'),
  t('activity', 'Frequently abandoning exercise routines', 'replacement', 'Count sessions of movement you enjoy — any amount counts.', { guidance: 'Rest days are part of a healthy routine. There is no need to push through pain.' }),
  t('activity', 'Neglecting movement or mobility breaks', 'replacement', 'Count gentle movement or stretching breaks.'),
  t('activity', 'Skipping outdoor activities', 'replacement', 'Count outdoor activities you do.'),
  t('activity', 'Inconsistent daily routine', 'replacement', 'Count days you follow your chosen routine.'),
  t('activity', 'Spending most leisure time on screens', 'time', 'Leisure screen time you want to rebalance.'),
  t('activity', 'Neglecting personal hygiene routines', 'replacement', 'Count days you complete your chosen self-care routine.', { guidance: 'Low energy can make self-care harder. Small steps count.' }),
  t('activity', 'Forgetting regular hydration', 'replacement', 'Count glasses of water.', { icon: 'droplet' }),
  t('activity', 'Avoiding routine healthcare appointments', 'replacement', 'Count appointments booked or attended.'),

  // 5.7 Emotional and mental patterns
  t('emotional', 'Negative self-talk', 'observation', 'Notice harsh inner criticism and try kinder alternatives.', { modes: ['observation', 'replacement'], guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Excessive rumination', 'observation', 'Notice repetitive thinking loops.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Constantly comparing myself with others', 'observation', 'Notice comparisons and what prompts them.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Catastrophising minor problems', 'observation', 'Notice when small problems feel enormous.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Avoiding uncomfortable conversations', 'replacement', 'Count conversations you have instead of avoiding.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Seeking constant reassurance', 'observation', 'Notice reassurance-seeking and what was happening.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Taking criticism very personally', 'observation', 'Notice strong reactions to feedback.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Suppressing emotions', 'replacement', 'Count times you name or express a feeling.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Perfectionism', 'observation', 'Notice when high standards stop you or wear you down.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Dwelling on past mistakes', 'observation', 'Notice when past mistakes take over your thoughts.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'Difficulty setting boundaries', 'replacement', 'Count boundaries you set or keep.', { guidance: REFLECT_GUIDANCE }),
  t('emotional', 'People-pleasing at my own expense', 'replacement', 'Count times you say no or state a preference.', { guidance: REFLECT_GUIDANCE }),

  // 5.8 Social habits
  t('social', 'Interrupting people', 'frequency', 'Notice and reduce interrupting others mid-sentence.'),
  t('social', 'Not listening attentively', 'replacement', 'Count conversations where you listened fully.'),
  t('social', 'Checking my phone during conversations', 'frequency', 'Phone checks while with other people.'),
  t('social', 'Cancelling plans at the last minute', 'frequency', 'Plans cancelled shortly before they happen.'),
  t('social', 'Avoiding communication about important issues', 'replacement', 'Count important conversations you start.'),
  t('social', 'Gossiping', 'frequency', 'Talking about people who are not present in ways you would rather not.'),
  t('social', 'Frequently being late', 'frequency', 'Arriving later than agreed.', { icon: 'clock' }),
  t('social', 'Making promises I cannot keep', 'observation', 'Notice commitments made in the moment that you cannot meet.'),
  t('social', 'Reacting defensively to feedback', 'observation', 'Notice defensive reactions and what helps you pause.'),
  t('social', 'Neglecting friendships', 'replacement', 'Count times you reach out to a friend.'),
  t('social', 'Spending time with people who pressure me', 'observation', 'Notice situations where others push you towards unwanted behaviour.'),

  // 5.9 Financial habits
  t('financial', 'Impulse buying', 'quantity', 'Unplanned purchases made on the spot.', { unit: 'money spent', modes: ['quantity', 'frequency'] }),
  t('financial', 'Buying unnecessary items', 'quantity', 'Purchases you later feel you did not need.', { unit: 'money spent', modes: ['quantity', 'frequency'] }),
  t('financial', 'Spending without tracking expenses', 'replacement', 'Count days you review your spending.'),
  t('financial', 'Frequently ordering takeaway', 'frequency', 'Takeaway orders more often than your budget allows.', { modes: ['frequency', 'quantity'], unit: 'money spent' }),
  t('financial', 'Paying bills late', 'frequency', 'Bills paid after their due date.'),
  t('financial', 'Unplanned online purchases', 'quantity', 'Online purchases you had not planned.', { unit: 'money spent', modes: ['quantity', 'frequency'] }),
  t('financial', 'Not saving towards goals', 'replacement', 'Count transfers into savings, however small.'),
  t('financial', 'Spending to improve my mood', 'observation', 'Notice when spending follows a difficult feeling.', { modes: ['observation', 'quantity'], unit: 'money spent' }),
  t('financial', 'Gambling beyond intended limits', 'quantity', 'Money or time spent gambling beyond your limit.', { unit: 'money spent', modes: ['quantity', 'frequency', 'abstinence'], icon: 'dice', guidance: 'Free, confidential gambling support and bank gambling blocks are available in many countries.' }),
  t('financial', 'Paying for unused subscriptions', 'replacement', 'Count subscriptions reviewed or cancelled.'),

  // 5.10 Personal organisation
  t('organisation', 'Leaving clutter everywhere', 'replacement', 'Count small tidy-ups.'),
  t('organisation', 'Avoiding cleaning', 'replacement', 'Count cleaning tasks done.'),
  t('organisation', 'Forgetting appointments', 'frequency', 'Appointments missed or remembered late.', { icon: 'calendar' }),
  t('organisation', 'Losing important items', 'frequency', 'Times you misplace keys, wallet, phone and so on.'),
  t('organisation', 'Ignoring emails and messages', 'replacement', 'Count inbox sessions where you reply or clear messages.'),
  t('organisation', 'Letting laundry accumulate', 'replacement', 'Count laundry loads done.'),
  t('organisation', 'Failing to plan ahead', 'replacement', 'Count days you plan tomorrow.'),
  t('organisation', 'Postponing small chores', 'replacement', 'Count small chores done straight away.'),
  t('organisation', 'Not maintaining a calendar', 'replacement', 'Count days you update your calendar.', { icon: 'calendar' }),
  t('organisation', 'Leaving tasks until the last moment', 'replacement', 'Count tasks started well ahead of time.'),

  // 5.11 Communication and behaviour
  t('communication', 'Lying to avoid consequences', 'observation', 'Notice moments you feel pulled to bend the truth, and what was at stake.'),
  t('communication', 'Making excuses instead of addressing problems', 'observation', 'Notice excuses and what addressing the problem would look like.'),
  t('communication', 'Speaking impulsively when angry', 'frequency', 'Things said in anger before pausing.', { alternatives: ['Pause and breathe before replying'] }),
  t('communication', 'Holding grudges', 'observation', 'Notice lingering resentment and what might help let it go.'),
  t('communication', 'Being unnecessarily argumentative', 'frequency', 'Arguments you would rather not have had.'),
  t('communication', 'Making assumptions without checking facts', 'observation', 'Notice assumptions and whether checking changed things.'),
  t('communication', 'Breaking commitments', 'frequency', 'Commitments you did not keep.'),
  t('communication', 'Being excessively critical of others', 'observation', 'Notice criticism and what you could say instead.'),
  t('communication', 'Reacting before thinking', 'frequency', 'Quick reactions you later wished you had paused on.'),
  t('communication', 'Avoiding apologies when appropriate', 'replacement', 'Count sincere apologies made when they were due.'),

  // 5.12 Custom examples
  t('custom', 'Nail biting', 'frequency', 'Repetitive nail biting.', { guidance: 'Body-focused repetitive behaviours are common and are not a lack of discipline. Noticing triggers and keeping hands busy can help; a GP can advise if it causes distress or injury.' }),
  t('custom', 'Skin picking', 'frequency', 'Repetitive skin picking.', { guidance: 'This can be linked to stress or a body-focused repetitive behaviour. A GP or therapist can help if it causes distress or injury.' }),
  t('custom', 'Hair pulling', 'frequency', 'Repetitive hair pulling.', { guidance: 'Hair pulling can be a recognised condition (trichotillomania). Specialist support is available — it is not a willpower problem.' }),
  t('custom', 'Daydreaming that interferes with responsibilities', 'time', 'Daydreaming that takes time from things you need to do.'),
  t('custom', 'Repeated checking behaviours', 'observation', 'Checking locks, appliances or messages repeatedly.', { guidance: 'If checking feels hard to stop or causes anxiety, a GP or therapist can help.' }),
  t('custom', 'Compulsive shopping', 'quantity', 'Shopping that feels hard to control.', { unit: 'money spent', modes: ['quantity', 'frequency'] }),
];

export const templateById = (id?: string) => HABIT_TEMPLATES.find((tpl) => tpl.id === id);
