import { Session, Participant } from '../../types/realtime';

export interface CreateSessionResponse {
  session: Session;
  participant: Participant;
}

export interface JoinSessionResponse {
  session: Session;
  participant: Participant;
}

export async function createSessionApi(payload: {
  name: string;
  hostName: string;
  deviceLabel: string;
  deviceType: string;
  customJoinCode?: string;
}): Promise<CreateSessionResponse> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.statusText}`);
  }
  return res.json();
}

export async function getSessionApi(sessionIdOrCode: string): Promise<Session> {
  const res = await fetch(`/api/sessions/${sessionIdOrCode}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch session: ${res.statusText}`);
  }
  const data = await res.json();
  return data.session;
}

export async function joinSessionApi(
  sessionIdOrCode: string,
  payload: {
    displayName: string;
    deviceLabel: string;
    deviceType: string;
    participantId?: string;
  }
): Promise<JoinSessionResponse> {
  const res = await fetch(`/api/sessions/${sessionIdOrCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to join session: ${res.statusText}`);
  }
  return res.json();
}

export async function startSessionApi(sessionId: string): Promise<Session> {
  const res = await fetch(`/api/sessions/${sessionId}/start`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`Failed to start session: ${res.statusText}`);
  }
  const data = await res.json();
  return data.session;
}

export async function stopSessionApi(sessionId: string): Promise<Session> {
  const res = await fetch(`/api/sessions/${sessionId}/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`Failed to stop session: ${res.statusText}`);
  }
  const data = await res.json();
  return data.session;
}

export async function getEvaluationApi(sessionId: string) {
  const res = await fetch(`/api/sessions/${sessionId}/evaluation`);
  if (!res.ok) {
    throw new Error(`Failed to get evaluation: ${res.statusText}`);
  }
  return res.json();
}
