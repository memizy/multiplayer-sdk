/**
 * Hard-coded demo OQSE items used by the multiplayer-quiz example.
 *
 * Each item conforms to the real `@memizy/oqse` schemas so that the
 * plugin can use `isMCQSingle`, `isTrueFalse` and `isShortAnswer`
 * guards shipped by the SDK. The set is intentionally tiny so the
 * sandbox boots instantly.
 */

import type { OQSEItem, OQSEMeta } from '@memizy/multiplayer-sdk';

export const SAMPLE_ITEMS: OQSEItem[] = [
  {
    id: 'q-capital-fr',
    type: 'mcq-single',
    question: 'What is the capital of **France**?',
    options: ['Paris', 'Lyon', 'Marseille', 'Bordeaux'],
    correctIndex: 0,
    shuffleOptions: false,
    explanation: 'Paris has been the capital of France since 508 CE.',
  },
  {
    id: 'q-mitochondrion',
    type: 'true-false',
    question: 'The mitochondrion is the *powerhouse* of the cell.',
    answer: true,
    explanation: 'A classic biology fact — mitochondria produce ATP.',
  },
  {
    id: 'q-pi-decimal',
    type: 'mcq-single',
    question: 'Which number is **closest** to π?',
    options: ['2.14', '3.14', '3.41', '4.13'],
    correctIndex: 1,
    shuffleOptions: false,
    explanation: 'π ≈ 3.14159…',
  },
  {
    id: 'q-ts-lang',
    type: 'true-false',
    question: 'TypeScript is a superset of JavaScript.',
    answer: true,
    explanation:
      'Every valid JavaScript program is also a valid TypeScript program.',
  },
  {
    id: 'q-periodic-o',
    type: 'short-answer',
    question: 'What is the chemical symbol for **oxygen**?',
    answers: ['O', 'o'],
    caseSensitive: false,
    trimWhitespace: true,
    explanation: 'Oxygen (atomic number 8) uses the symbol `O`.',
  },
  {
    id: 'q-moon-saturn',
    type: 'mcq-single',
    question: 'Which planet has the most confirmed moons (as of 2025)?',
    options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    correctIndex: 1,
    shuffleOptions: false,
    explanation: 'Saturn pulled ahead in 2023 with 146 confirmed moons.',
  },
];

export const SAMPLE_SET_META: OQSEMeta = {
  id: '00000000-0000-0000-0000-0000000000aa',
  version: '0.1',
  title: 'General Knowledge Sampler',
  description:
    'A tiny demo set used to exercise the Memizy multiplayer SDK. ' +
    'Mixes MCQ, true/false and short-answer items.',
  language: 'en',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  requirements: { features: ['markdown'] },
} as unknown as OQSEMeta;
