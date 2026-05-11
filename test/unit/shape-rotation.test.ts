import { describe, it, expect } from 'vitest';
import { rotatedShape } from '../../src/shape-rotation';
import type { PieceShape } from '../../src/shapes';

const corner: PieceShape = { N: 0, E: 1, S: 1, W: 0 };
const edge: PieceShape = { N: 0, E: 1, S: -1, W: 1 };
const interior: PieceShape = { N: 1, E: -1, S: 1, W: -1 };

describe('rotatedShape', () => {
  it('rotation 0 is identity', () => {
    expect(rotatedShape(corner, 0)).toEqual(corner);
  });

  it('rotation 90: new N = old W (tabs/blanks shift clockwise to new positions)', () => {
    const r = rotatedShape(corner, 90);
    expect(r.N).toBe(corner.W);
    expect(r.E).toBe(corner.N);
    expect(r.S).toBe(corner.E);
    expect(r.W).toBe(corner.S);
  });

  it('rotation 180: flips opposite faces', () => {
    const r = rotatedShape(corner, 180);
    expect(r.N).toBe(corner.S);
    expect(r.E).toBe(corner.W);
    expect(r.S).toBe(corner.N);
    expect(r.W).toBe(corner.E);
  });

  it('rotation 270 is inverse of rotation 90', () => {
    const r = rotatedShape(rotatedShape(corner, 90), 270);
    expect(r).toEqual(corner);
  });

  it('signs are preserved (tabs stay tabs, blanks stay blanks)', () => {
    const r = rotatedShape(interior, 90);
    const signs = [interior.N, interior.E, interior.S, interior.W].sort();
    const rotSigns = [r.N, r.E, r.S, r.W].sort();
    expect(rotSigns).toEqual(signs);
  });

  it('edge piece rotated 90 has flat edge in new position', () => {
    const r = rotatedShape(edge, 90);
    expect(r.E).toBe(0);   // old N (flat) is now at E
  });

  it('four rotations bring back identity', () => {
    let r = corner;
    for (let i = 0; i < 4; i++) r = rotatedShape(r, 90);
    expect(r).toEqual(corner);
  });
});
