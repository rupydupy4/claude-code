import { useNavigate } from 'react-router-dom';
import { ORB_LABEL, Orb } from '../components/ui';
import { getState } from '../data/store';
import { getSession, queuePrompt, startListening, stopListening, useSession } from './session';

/** The central voice control: tap to speak a command; the transcript is sent from the Assistant screen. */
export function useVoiceToggle() {
  const navigate = useNavigate();
  return () => {
    if (getSession().listening) return stopListening();
    if (!getState().settings.voice.enabled) return navigate('/assistant?focus=1');
    const ok = startListening((text) => {
      queuePrompt({ text, voice: true });
      navigate('/assistant');
    });
    if (!ok) navigate('/assistant?focus=1');
  };
}

export function VoiceButton({ size = 52 }: { size?: number }) {
  const session = useSession();
  const onClick = useVoiceToggle();
  const label = session.listening ? 'Stop listening' : 'Speak to the assistant';
  return (
    <button type="button" className="orb-btn" onClick={onClick} aria-label={label} title={`${label} — ${ORB_LABEL[session.orb]}`} aria-pressed={session.listening}>
      <Orb state={session.orb} size={size} />
    </button>
  );
}

