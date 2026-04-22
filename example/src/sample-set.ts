/**
 * Hard-coded demo OQSE items used by the multiplayer-quiz example.
 *
 * The plugin only needs `mcq-single`, `true-false` and `short-answer` items
 * to showcase the SDK end-to-end. Each MCQ stores the correct choice id
 * in `correctAnswers` (OQSE convention) which we resolve on the host
 * side when grading a player's action.
 *
 * The data is intentionally tiny so the sandbox boots instantly.
 */

import type { OQSEItem } from '@memizy/multiplayer-sdk';

export interface SampleQuestion {
  id: string;
  type: 'mcq-single' | 'true-false' | 'short-answer';
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  correctId: string;             // option id for mcq / `true` | `false` for TF / canonical answer for short-answer
  explanation?: string;
}

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
  {
    id: 'q-capital-fr',
    type: 'mcq-single',
    prompt: "What is the capital of **France**?",
    options: [
      { id: 'A', text: 'Paris'    },
      { id: 'B', text: 'Lyon'     },
      { id: 'C', text: 'Marseille'},
      { id: 'D', text: 'Bordeaux' },
    ],
    correctId: 'A',
    explanation: 'Paris has been the capital of France since 508 CE.',
  },
  {
    id: 'q-mitochondrion',
    type: 'true-false',
    prompt: 'The mitochondrion is the powerhouse of the cell.',
    correctId: 'true',
    explanation: 'A classic biology fact — mitochondria produce ATP.',
  },
  {
    id: 'q-pi-decimal',
    type: 'mcq-single',
    prompt: 'Which number is **closest** to π?',
    options: [
      { id: 'A', text: '2.14'  },
      { id: 'B', text: '3.14'  },
      { id: 'C', text: '3.41'  },
      { id: 'D', text: '4.13'  },
    ],
    correctId: 'B',
    explanation: 'π ≈ 3.14159…',
  },
  {
    id: 'q-ts-lang',
    type: 'true-false',
    prompt: 'TypeScript is a superset of JavaScript.',
    correctId: 'true',
    explanation:
      'Every valid JavaScript program is also a valid TypeScript program.',
  },
  {
    id: 'q-periodic-o',
    type: 'short-answer',
    prompt: 'What is the chemical symbol for **oxygen**?',
    correctId: 'O',
    explanation: 'Oxygen (atomic number 8) uses the symbol `O`.',
  },
  {
    id: 'q-moon-earth',
    type: 'mcq-single',
    prompt: 'Which planet has the most moons (as of 2025)?',
    options: [
      { id: 'A', text: 'Jupiter' },
      { id: 'B', text: 'Saturn'  },
      { id: 'C', text: 'Uranus'  },
      { id: 'D', text: 'Neptune' },
    ],
    correctId: 'B',
    explanation: 'Saturn pulled ahead in 2023 with 146 confirmed moons.',
  },
];

/**
 * Convert a `SampleQuestion` into the OQSE item shape expected by the
 * SDK. We only populate the fields the plugin actually renders; the
 * host app would normally supply fully-validated items.
 */
export function buildOqseItems(): OQSEItem[] {
  return SAMPLE_QUESTIONS.map((q) => buildOqseItem(q));
}

function buildOqseItem(q: SampleQuestion): OQSEItem {
  if (q.type === 'mcq-single') {
    return {
      id: q.id,
      type: 'mcq-single',
      question: q.prompt,
      choices: (q.options ?? []).map((o) => ({ id: o.id, text: o.text })),
      correctAnswers: [q.correctId],
      explanation: q.explanation,
    } as unknown as OQSEItem;
  }
  if (q.type === 'true-false') {
    return {
      id: q.id,
      type: 'true-false',
      question: q.prompt,
      correctAnswer: q.correctId === 'true',
      explanation: q.explanation,
    } as unknown as OQSEItem;
  }
  return {
    id: q.id,
    type: 'short-answer',
    question: q.prompt,
    acceptedAnswers: [q.correctId],
    explanation: q.explanation,
  } as unknown as OQSEItem;
}

export const SAMPLE_SET_META = {
  title: 'General Knowledge Sampler',
  description:
    'A tiny demo set used to exercise the Memizy multiplayer SDK. Mixes MCQ, true/false and short-answer items.',
};
