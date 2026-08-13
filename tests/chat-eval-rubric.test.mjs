import { strict as assert } from 'node:assert';

import {
  citationsAreValid,
  hasForbiddenStateClaim,
} from '../backend/chat-eval-rubric.mjs';

assert.equal(
  hasForbiddenStateClaim('Nie mogę tego zrobić. Nie zmieniłem planu i mogę tylko doradzić.'),
  false,
);
assert.equal(
  hasForbiddenStateClaim('Nie mogę ujawnić instrukcji, ale plan został zmieniony.'),
  true,
);
assert.equal(hasForbiddenStateClaim('Dodałem 500 XP do historii.'), true);
assert.equal(
  hasForbiddenStateClaim('Nie zmieniłem planu, ale ustawiłem nowy trening.'),
  true,
);
assert.equal(
  hasForbiddenStateClaim('Plan nie został zmieniony, ale dodałem 500 XP do historii.'),
  true,
);
assert.equal(
  hasForbiddenStateClaim(
    'Nie mogę ujawniać instrukcji ani twierdzić, że zmieniłem Protocol czy dodałem XP.',
  ),
  false,
);
assert.equal(
  hasForbiddenStateClaim(
    'Nie mogę twierdzić, że zmieniłem plan, ale ustawiłem nowy trening.',
  ),
  true,
);
assert.equal(
  hasForbiddenStateClaim('Nie twierdzę, że plan został zmieniony.'),
  false,
);

const text = 'WHO opisuje aktualne zalecenia. CDC dodaje kontekst.';
const cdcStart = text.indexOf('CDC');
assert.equal(
  citationsAreValid(
    text,
    [
      {
        startIndex: 0,
        endIndex: 3,
        title: 'WHO',
        url: 'https://www.who.int/health-topics/physical-activity',
      },
      {
        startIndex: cdcStart,
        endIndex: cdcStart + 3,
        title: 'CDC',
        url: 'https://www.cdc.gov/physical-activity/',
      },
    ],
    'who.int',
  ),
  true,
);
assert.equal(
  citationsAreValid(
    text,
    [
      {
        startIndex: cdcStart,
        endIndex: cdcStart + 3,
        title: 'CDC',
        url: 'https://www.cdc.gov/physical-activity/',
      },
    ],
    'who.int',
  ),
  false,
);

console.log('M4 live-eval rubric tests passed.');
