import type { MemoryItem } from "./model";

export const memoryQuestions = [
  { domain: "identity", title: "About me", question: "What name should Mission use, and what matters most to you?" },
  { domain: "work", title: "How I work", question: "What do you do, and how do you like to work?" },
  { domain: "projects", title: "What I'm building", question: "What are you working on that an assistant should understand?" },
  { domain: "preferences", title: "My preferences", question: "How should an assistant communicate and make decisions with you?" },
  { domain: "goals", title: "What I'm aiming for", question: "What would you like to make progress on this year?" },
  { domain: "routines", title: "My routines", question: "What does a typical week look like for you?" },
  { domain: "people", title: "People who matter", question: "Who are the important people in your life, and how do they relate to you?" },
  { domain: "health", title: "Health context", question: "Is there health context you want Mission to remember? Share only what feels useful." },
  { domain: "fitness", title: "Movement and habits", question: "What habits or activities are you trying to keep up?" },
  { domain: "learning", title: "What I'm learning", question: "What are you curious about or actively learning?" },
  { domain: "home", title: "Places in my life", question: "Which places shape your day-to-day life?" },
  { domain: "finance", title: "Money goals", question: "Are there financial goals or preferences worth remembering? Never add account numbers or passwords." },
] as const;

export function missingMemoryQuestions(items: MemoryItem[]) {
  const covered = new Set(items.map((item) => item.domain));
  return memoryQuestions.filter((question) => !covered.has(question.domain));
}
