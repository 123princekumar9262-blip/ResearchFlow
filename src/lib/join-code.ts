/** XXXX-XXXX, as people read and type it. */
export function formatCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Ready-to-send text for students: the app link and the code. */
export function inviteMessage(code: string, origin: string) {
  const host = origin.replace(/^https?:\/\//, "");
  return `I'm using ResearchFlow to track our project deadlines and weekly progress. Sign up at ${host} as a Student, then enter my join code in Settings: ${formatCode(code)}`;
}
