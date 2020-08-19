const got = require('../got.js');
let fs = require("fs")

let g;
let g1;
let d;
let ab;
// jest does this before running tests
describe('feedback path detection', () => {
    beforeAll(() => {
    })
    afterAll(() => {
      /* Runs after all tests */
    })
    beforeEach(() => {
      /* Runs before each test */
      d = JSON.parse(fs.readFileSync('__tests__/deltas/scene_feedback.json'))
      g = got.graphFromDeltas(d)
      g1 = got.graphFromDeltas(d)
    })
    afterEach(() => {
      /* Runs after each test */
    })

    test('find a feedback path', () => {
        // expect(typeof got.deltasToString(d)).toBe('string');
        g = got.graphFromDeltas(d)
        g1 = got.graphFromDeltas(d)

        // expect(typeof g).toBe('object');
        // expect(g).toMatchObject(simpleSceneSuccess);
        // expect(got.deepEqual(g, g1)).toBe(true)
        // expect(got.deepEqual(got.deltasFromGraph(g, []), got.deltasFromGraph(g1, []))).toBe(true)
    });

})