import { CaptionSegment, Session } from '../types/realtime';

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);

  const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
  const formattedMins = mins % 60 < 10 ? `0${mins % 60}` : `${mins % 60}`;

  if (hrs > 0) {
    const formattedHrs = hrs < 10 ? `0${hrs}` : `${hrs}`;
    return `${formattedHrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${formattedMins}:${formattedSecs}`;
}

export function formatTimestampMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  return formatTime(totalSeconds);
}

export function generateJoinCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function exportTranscriptAsTxt(session: Session): void {
  const dateStr = new Date(session.createdAt).toLocaleString();
  let content = `ROUNDTABLE SESSION TRANSCRIPT\n`;
  content += `=========================================\n`;
  content += `Session Name : ${session.name}\n`;
  content += `Room Code    : ${session.joinCode}\n`;
  content += `Date         : ${dateStr}\n`;
  content += `Participants : ${session.participants.map(p => `${p.displayName} (${p.deviceLabel})`).join(', ')}\n`;
  content += `Total Turns  : ${session.transcriptSegments.length}\n`;
  content += `=========================================\n\n`;

  session.transcriptSegments.forEach(seg => {
    const time = formatTimestampMs(seg.startMs);
    const overlapTag = seg.overlap ? ' [SIMULTANEOUS SPEECH]' : '';
    content += `[${time}] ${seg.speakerName} (${seg.sourceDeviceId})${overlapTag}:\n`;
    content += `  ${seg.text}\n\n`;
  });

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `roundtable-${session.joinCode.toLowerCase()}-transcript.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportTranscriptAsJson(session: Session): void {
  const data = {
    roundtableVersion: '1.0.0',
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    name: session.name,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    participants: session.participants,
    metrics: session.metrics,
    transcript: session.transcriptSegments,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `roundtable-${session.joinCode.toLowerCase()}-session.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
