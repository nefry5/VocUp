import { describe, it, expect } from 'vitest'
import { WORDS, SUBCATEGORIES, FREE_SUBCATS, getWordsBySub } from './words'

describe('vocab dataset', () => {
  it('has exactly 440 words', () => {
    expect(WORDS).toHaveLength(440)
  })

  it('all IDs are unique', () => {
    const ids = WORDS.map(w => w.id)
    expect(new Set(ids).size).toBe(440)
  })

  it('IDs are sequential w001..w440', () => {
    for (let i = 1; i <= 440; i++) {
      const id = `w${String(i).padStart(3, '0')}`
      expect(WORDS.find(w => w.id === id), `missing ${id}`).toBeDefined()
    }
  })

  it('all words have non-empty fr/en/de/es/it fields', () => {
    WORDS.forEach(w => {
      expect(w.fr.trim(), `${w.id} fr empty`).not.toBe('')
      expect(w.en.trim(), `${w.id} en empty`).not.toBe('')
      expect(w.de.trim(), `${w.id} de empty`).not.toBe('')
      expect(w.es.trim(), `${w.id} es empty`).not.toBe('')
      expect(w.it.trim(), `${w.id} it empty`).not.toBe('')
    })
  })

  it('all pos codes are valid', () => {
    const valid = new Set(['v', 'n', 'a', 'x'])
    WORDS.forEach(w => expect(valid.has(w.pos), `${w.id} bad pos ${w.pos}`).toBe(true))
  })

  it('per-category counts match spec', () => {
    const expected: Record<string, number> = {
      '1': 62, '2': 62, '3': 64, '4': 53, '5': 46,
      '6': 34, '7': 32, '8': 41, '9': 46,
    }
    for (const [catId, count] of Object.entries(expected)) {
      const actual = WORDS.filter(w => w.catId === catId).length
      expect(actual, `cat ${catId} count`).toBe(count)
    }
  })

  it('subcategory word counts match metadata', () => {
    SUBCATEGORIES.forEach(sub => {
      const actual = getWordsBySub(sub.id).length
      expect(actual, `sub ${sub.id} word count`).toBe(sub.wordCount)
    })
  })

  it('free subcats are the 4 BASIQUE subs', () => {
    expect(FREE_SUBCATS).toEqual(['1.1', '1.2', '1.3', '1.4'])
  })
})
