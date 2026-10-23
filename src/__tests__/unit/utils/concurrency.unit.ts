import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {reduceWithConcurrency, withConcurrency} from '../../../utils/concurrency';

describe('Utils: concurrency', () => {
  describe('reduceWithConcurrency', () => {
    it('folds every result in input order', async () => {
      const total = await reduceWithConcurrency(
        [1, 2, 3, 4, 5],
        2,
        async (n: number) => n * 2,
        (acc: number[], doubled) => [...acc, doubled],
        [] as number[],
      );

      expect(total).to.deepEqual([2, 4, 6, 8, 10]);
    });

    it('returns the initial accumulator for an empty input', async () => {
      const result = await reduceWithConcurrency(
        [] as number[],
        3,
        async (n: number) => n,
        (acc: number[], n) => [...acc, n],
        [] as number[],
      );

      expect(result).to.deepEqual([]);
    });

    it('treats a concurrency below 1 as 1', async () => {
      const fn = sinon.stub().resolves(1);
      await reduceWithConcurrency([1, 2, 3], 0, fn, (acc: number) => acc, 0);
      expect(fn.callCount).to.equal(3);
    });

    it('stops dispatching work once the accumulator throws', async () => {
      const fn = sinon.stub().resolves(1);

      await expect(
        reduceWithConcurrency(
          [1, 2, 3, 4, 5, 6],
          2,
          fn,
          (acc: number, value: number) => {
            const next = acc + value;
            if (next > 1) {
              throw new Error('over budget');
            }
            return next;
          },
          0,
        ),
      ).to.be.rejectedWith('over budget');

      // The first batch of 2 ran; the remaining 4 items were never dispatched.
      expect(fn.callCount).to.equal(2);
    });

    it('never runs more than `limit` items at once', async () => {
      let inFlight = 0;
      let peak = 0;

      await reduceWithConcurrency(
        Array.from({length: 9}, (_, i) => i),
        3,
        async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise(resolve => {
            setTimeout(resolve, 1);
          });
          inFlight -= 1;
          return 1;
        },
        (acc: number, value: number) => acc + value,
        0,
      );

      expect(peak).to.equal(3);
    });
  });

  describe('withConcurrency', () => {
    it('still collects every result in order', async () => {
      const results = await withConcurrency([1, 2, 3], 2, async n => n + 1);
      expect(results).to.deepEqual([2, 3, 4]);
    });
  });
});
