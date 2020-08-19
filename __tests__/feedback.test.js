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
      
      g = JSON.parse(fs.readFileSync('__tests__/deltas/scene_feedback.json'))
    //   g1 = got.graphFromDeltas(d)
    })
    afterEach(() => {
      /* Runs after each test */
    })

    test('list all nodes in graph', () => {
        // console.log(g.nodes)
        let expected =  [ 
            'lfo_1.sine',
            'lfo_1.phasor',
            'lfo_1.pulse',
            'lfo_1.sine_index',
            'lfo_1.saw',
            'lfo_2.sine',
            'lfo_2.phasor',
            'lfo_2.pulse',
            'lfo_2.sine_index',
            'lfo_2.saw',
            'dualvco_1.vco_1',
            'dualvco_1.vco_2',
            'dualvco_1.master',
            'vca_1.output',
            'pulsars_1.output' 
        ]
        let nodes = got.getNodes(g)
        // console.log(nodes)
        expect(got.deepEqual(expected, nodes)).toBe(true)
    })

    
    test('list all adjacent nodes in graph', () => {
        // expect(typeof got.deltasToString(d)).toBe('string');
        // g = got.graphFromDeltas(d)
        let nodes =  [ 
            'lfo_1.sine',
            'lfo_1.phasor',
            'lfo_1.pulse',
            'lfo_1.sine_index',
            'lfo_1.saw',
            'lfo_2.sine',
            'lfo_2.phasor',
            'lfo_2.pulse',
            'lfo_2.sine_index',
            'lfo_2.saw',
            'dualvco_1.vco_1',
            'dualvco_1.vco_2',
            'dualvco_1.master',
            'vca_1.output',
            'pulsars_1.output' 
        ]
        let expected = { 
            lfo_1: [ 
                [ 'lfo_1.sine', 'vca_1.cv' ] 
            ],   
            lfo_2: [ [ 'lfo_2.phasor', 'dualvco_1.index_cv' ],
            [ 'lfo_2.saw', 'vca_1.signal' ] ],      
            dualvco_1: [ [ 'dualvco_1.master', 'pulsars_1.signal' ] ],
            vca_1:
            [ [ 'vca_1.output', 'dualvco_1.rate_1_cv' ],
            [ 'vca_1.output', 'pulsars_1.period_cv' ] ],
            pulsars_1:
            [ [ 'pulsars_1.output', 'lfo_1.fm_cv' ],  
            [ 'pulsars_1.output', 'speaker_1.input' ],
            [ 'pulsars_1.output', 'pulsars_1.formant_cv' ] ] 
        }
        let adjacents = got.getAdjacents(0, nodes, g)
        
        // console.log(adjacents)
        expect(got.deepEqual(expected, adjacents)).toBe(true)

    });

    test('list all feedback paths in graph', () => {
        throw('this test not completed yet')
    })


})