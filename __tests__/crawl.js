let deltas = [
    {"op":"propchange","path":"lfo_1.rate","name":"value","from":0.17,"to":34},
    {"op":"propchange","path":"lfo_1.rate","name":"value","from":0.17,"to":36}
]

let visited = []
let differentTo = {}
for(i=0; i<deltas.length;i++){
    let path = deltas[i].path
    // if(visited.includes(deltas[i].path))
    console.log(deltas[i].path)
    visited.push(deltas[i].path)
}