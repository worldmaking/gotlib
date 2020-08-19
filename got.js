/*
	Graph Operational Transforms
	(not game of thrones :-))
*/

let previousDelta;
let graphContainer;
const assert = require ("assert");
// use array-equal in the feedback detection section
const equals = require('array-equal')

// see https://github.com/worldmaking/msvr/wiki/List-of-Operational-Transforms
/*
	Every op should be invertible (which means, destructive edits must include full detail of what is to be deleted)
	Changes are rebased by graph path (rather than character position as in text documents)

	Simultaneous edits must be merged: the second is rebased by the first. 

*/

function deepEqual(a, b) {
	// FIXME expensive lazy way:
	return JSON.stringify(a) == JSON.stringify(b);
}

function deepCopy(a) {
	// FIXME expensive lazy way:
	return JSON.parse(JSON.stringify(a));
}

// copy all properties from src to dst
// excepting any reserved keys (op, path)
let copyProps = function(src, dst) {
	for (let k in src) {
		if (k == "op" || k == "path") continue;
		// recursive objects (deep copy)
		// FIXME expensive lazy way:
		dst[k] = deepCopy(src[k]);
	}
	return dst;
}

// find a path within a tree:
let findPath = function(tree, path) {
	let steps = path.split(".");
	let n = tree;
	for (let k in steps) {
		assert(n[k], "failed to find path");
		n = n[k];
	}
	return n;
}

// given a tree, find the node that contains last item on path
// returns [undefined, path] if the path could not be fully resolved
let findPathContainer = function(tree, path) {
	let steps = path.split(".");
	let last;
	let container;
	let node = tree;
	for (let i=0; i<steps.length; i++) {
		let k = steps[i]
		//assert(node[k], "failed to find path: "+k);
		if (!node[k]){
			//return [undefined, k];
			let errorMsg = 'delta failed on path: ' + path
			throw(errorMsg)
		} 
		last = k;
		container = node;
		node = node[k];
	}
	return [container, last];
}

// given path "a.b.c.d", creates object root.a.b.c.d
// throws error if root.a.b.c doesn't exist
// repaths if root.a.b.c.d already exists
let makePath = function(root, path, graph) {
	let steps = path.split(".");
	let last = steps.pop();
	let n = root;
	for (let k of steps) {
		if(!n[k]){
			throw 'newnode failed: failed to find paths'
		}
		n = n[k];
	}
	if(n[last]){

		// A1: newnode @x
		// B1: newnode @x

		// This can be resolved by inserting a repath to rename x:

		// B1: newnode @x
		// +B2: repath @x->@y
		// A1: newnode @x

		// Using a repath delta ensures that the name change can propagate for longer sequences of edits too. 
		// repath A
		//! Need to ask Graham how to call a repath?
		throw "NOTE: Not sure how to run a repath."

	}
	let o = { _props: {} };
	n[last] = o;
	return o;
}

// given a delta it returns the inverse operation 
// such that applying inverse(delta) undoes all changes contained in delta
let inverseDelta = function(delta) {
	if (Array.isArray(delta)) {
		let res = [];
		// invert in reverse order:
		for (let i=delta.length-1; i>=0; i--) {
			res.push(inverseDelta(delta[i]));
		}
		return res;
	} else {
		switch (delta.op) {
			case "newnode": {
				let d = {
					op: "delnode",
					path: delta.path,
				};
				copyProps(delta, d);
				return d;
			} break;
			case "delnode": {
				let d = {
					op: "newnode",
					path: delta.path,
				};
				copyProps(delta, d);
				return d;
			} break;
			
			case "connect": {
				return {
					op: "disconnect",
					paths: [ delta.paths[0], delta.paths[1] ]
				}
			} break;
			case "disconnect": {
				return {
					op: "connect",
					paths: [ delta.paths[0], delta.paths[1] ]
				}
			} break;
			case "repath": {
				return {
					op: "repath",
					paths: [delta.paths[1], delta.paths[0]],
				};
			} break;
			case "propchange": {
				return {
					op:"propchange", 
					path: delta.path,
					name: delta.name,
					from: delta.to,
					to: delta.from
				}
			} break;
		}
	}
}

// rebase B in terms of the changes in A
// returns new list of deltas containing both effects of A then B:
let rebase = function(B, A, result) {
	if (Array.isArray(A)) {
		for (let a of A) {
			try {
				// rebase B in terms of a:
				let b = rebase(B, a, result);
				// push a into result first
				result.push(deepCopy(a));
				// finally, add resolved B to result
				if (b) result.push(b);
			} catch(e) {
				throw(e);
			}
		}
	} else if (Array.isArray(B)) {
		// A is a single edit:
		for (let b of B) {
			// then rebase b in terms of the single edit in A:
			rebase(b, A, result);
		}
	} else {
		// both A and B are now single edits
		// check the two operations to see if they could have any influence on each other
		// use 'b' as the resolved edit:
		let b = deepCopy(B);

		// check for conflicts:
		switch (A.op) {
			case "connect": {
				// if B is the same connect, skip it
				if (b.op == "connect" && b.paths[0]==A.paths[0] && b.paths[1]==A.paths[1]) {
					return; // skip duplicate operation
				}
			} break;
			case "disconnect": {
				// if B is the same disconnect, skip it
				if (b.op == "disconnect" && b.paths[0]==A.paths[0] && b.paths[1]==A.paths[1]) {
					return; // skip duplicate operation
				}
			} break;
			case "newnode": {
				// check duplicate ops:
				if (deepEqual(A, b)) {
					return; // skip duplicate operation
				}
				// otherwise error on same name:
				if (A.path == b.path) {
					throw("cannot create node; path already exists");
				}
			} break;
			case "delnode": {
				// if B is the same op, skip it
				if (b.op == "delnode" && b.path==A.path) {
					return; // skip duplicate operation
				}
				// check path use
				let path = A.path;
				if ((b.path && b.path == A.path) ||
					(b.paths && (b.paths[0] == A.path || b.paths[1] == A.path))) {
					throw("cannot delete node; path is used in subsequent edits")
				}
			} break;
			case "repath": {
				// if any other op uses the same path, have to change it:
				let [src, dst] = A.path;
				if (b.path == src) { b.path = dst; } 
				if (b.paths && b.paths[0] == src) { b.paths[0] = dst; }
				if (b.paths && b.paths[1] == src) { b.paths[1] = dst; }
			} break;
			case "propchange": {
				// TODO -- are there any potential conflicts?
				if (b.op == "propchange" && b.path==A.path && b.name==A.name && approximatelyEqual(b.from, a.from) === false) {
					// if both A and b change the same property, then they should be merged or sequenced
					b.from = A.to;
					// // console.log(b.from, A.to)
				}
			} break;
		}
		return b;
	}
	return;
}

let mergeDeltasToGraph = function(graph, deltasA, deltasB) {
	/*
		first, try to rebase deltasB in terms of deltasA
		then apply deltasA, then apply rebased-deltasB

		lots of ways this can fail
	*/
	
}

// this function will invert the deltas already applied and return a rejection message
let malformedDeltaRejection = function(malformedDelta, appliedDeltas, errorMsg, graph){
	appliedDeltas.pop() // remove the malformedDelta
	// get the inverse of the deltas that were successfully applied up to (and less) the malformed delta
	let rewindDeltas = inverseDelta(appliedDeltas)
	// rewind the changes:
	applyDeltasToGraph(graph, rewindDeltas)
	// clear the appliedDeltas for the next incoming batch
	appliedDeltas = []
	// create a msg to pass to the app.js or host.js in order to perform the nuclear option
	rejectionMsg = {
		type: 'malformedDelta',
		error: errorMsg,
		inverseDeltas: rewindDeltas,
		malformedDelta: malformedDelta,
		graph: graph
	}
	return rejectionMsg 
}

// this function will catch a conflict delta for which we don't yet have a merge strategy, reporting the error to the parent
let conflictDeltaWarning = function(conflictDelta, appliedDeltas, errorMsg, graph){
	appliedDeltas.pop() // remove the malformedDelta
	// // get the inverse of the deltas that were successfully applied up to (and less) the malformed delta
	let rewindDeltas = inverseDelta(appliedDeltas)
	// // rewind the changes:
	// applyDeltasToGraph(graph, rewindDeltas)
	// clear the appliedDeltas for the next incoming batch
	appliedDeltas = []
	// create a msg to pass to the app.js or host.js in order to perform the nuclear option
	rejectionMsg = {
		type: 'conflictDelta',
		error: errorMsg,
		inverseDeltas: rewindDeltas,
		conflictDelta: conflictDelta,
		graph: graph
	}
	//TODO: this function seems to be causing false positives in the nuclear option, so for now we will not return the error
	// return null
	return rejectionMsg 
}

let rejectionMsg = null
let gotHistory = []
let prevRepath, prevNewnode, prevDelnode, prevPropchange
let appliedDeltas = [];
let applyDeltasToGraph = function (graph, delta) {
	rejectionMsg = null
	if (Array.isArray(delta)) {
		for (let d of delta) {
			// temporarily store each delta so that if theres an error we can invert them
			appliedDeltas.push(d)
			applyDeltasToGraph(graph, d);
			previousDelta = delta
		}
	} else {
		switch (delta.op) {
			case "repath": {
				if(delta.paths.length < 2 || !delta.paths[0] || !delta.paths[1]){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange repath is missing one or more path(s)', graph)
					break
				} else  {

					
					// if (prevRepath){
					// 	// console.log(delta, previousDelta)
					// 	throw delta, prevRepath
					// }
					let [ctr0, src] = findPathContainer(graph.nodes, delta.paths[0]);
					let [ctr1, dst] = findPathContainer(graph.nodes, delta.paths[1]);

					// throw('test')
					// // find destination container:
					let steps = delta.paths[1].split(".");
					steps.pop(); // ignoring the last element
					let container = graph.nodes;
					for (let i=0; i<steps.length; i++) {
						let k = steps[i]
						container = container[k];
					}

					// move its
					container[dst] = ctr0[src];
					delete ctr0[src];				
					// repath arcs:
					for (let arc of graph.arcs) {
						if (arc[0] == delta.paths[0]) arc[0] = delta.paths[1];
						if (arc[1] == delta.paths[0]) arc[1] = delta.paths[1];
					}
					prevRepath = delta
				}
			} break;
			
			case "newnode": {
				// lets see the abstraction pos
				if(delta.category == 'abstraction'){
				}
				if(!delta.path){
					
					malformedDeltaRejection(delta, appliedDeltas, 'newnode delta contains no path', graph)
					break 
				} 
		
				else {
					let o = makePath(graph.nodes, delta.path, graph);
					copyProps(delta, o._props);					
				}
			} break;
			case "delnode": {
				if(!delta.path){
					malformedDeltaRejection(delta, appliedDeltas, 'delnode delta contains no path', graph)
					break 
				} else {
					let [ctr, name] = findPathContainer(graph.nodes, delta.path);
					if(!ctr){
						throw ('delnode failed: path not found')
					} else {
						let o = ctr[name];

						if(deepEqual(delta, previousDelta) === true){
							throw 'two delnode deltas are the same'
						}
						// let [ctr, name] = findPathContainer(graph.nodes, delta.path);
						// let o = ctr[name];
						// console.log()
						// for (let k in o._props) {
						// 	// assert(deepEqual(o._props[k], delta[k]), "delnode failed; properties do not match");
						// 	// console.log(deepEqual(o._props[k], delta[k]))
						// 	if(deepEqual(o._props[k], delta[k]) === false){
						// 		throw (`delnode failed for ${delta.path}; properties ${k} do not match`)
						// 	}						
						// }
						// assert o has no child nodes
						// keys should either be ['_props'] or just []:
						let keys = Object.keys(o);
						if(keys.length == 1 && keys[0]=="_props"){
							delete ctr[name];
						} else {
							// o has child nodes, so throw error
							throw ('delnode failed; node has children')
						}					
					}
				}
			} break;
			case "connect": {
				if(delta.paths.length < 2 || !delta.paths[0] || !delta.paths[1]){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange connect is missing one or more path(s)', graph)
					break
				} else if(delta.paths[0] === delta.paths[1]){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange connect contains identical paths', graph)
					break
				}
				else {
					// ensure connection does not yet exist
					if(!graph.arcs.find(e => e[0]==delta.paths[0] && e[1]==delta.paths[1])){
						// arc doesn't yet exist, so make it
						graph.arcs.push([ delta.paths[0], delta.paths[1] ]);
					} else {
						// arc already exists

						// preserve intention by inverting connection [A], then apply connection [B]
						let inverted = inverseDelta(delta)
						let resolve = [inverted, delta]
						applyDeltasToGraph(graph, resolve)
						// throw ('connect failed: arc already exists')
					}
				}

				
			} break;
			case "disconnect": {
				if(delta.paths.length < 2 || !delta.paths[0] || !delta.paths[1]){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange disconnect is missing one or more path(s)', graph)
					break
				} else if(delta.paths[0] === delta.paths[1]){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange disconnect contains identical paths', graph)
					break
				}
				// find matching arc; there should only be 1.
				let index = -1;
				for (let i in graph.arcs) {
					let a = graph.arcs[i];
					if (a[0] == delta.paths[0] && a[1] == delta.paths[1]) {
						// i don't yet know how the delta would look if there was more than one matching arc
						// assert(index == -1, "disconnect failed: more than one matching arc");
						if(index != -1){
							throw ('disconnect failed: more than one matching arc found')
						} else {
							index = i;
						}
					}
				}
				if(index != -1){
					graph.arcs.splice(index, 1);
				} else {
 
					// arc doesn't exist

					// preserve intention by inverting disconnect [A], then apply disconnect [B]
					let inverted = inverseDelta(delta)
					let resolve = [inverted, delta]
					applyDeltasToGraph(graph, resolve)

				}
			} break;

			case "propchange": {
				if(!delta.path){

					malformedDeltaRejection(delta, appliedDeltas, 'propchange delta contains no path', graph)
					break 
				} else if(delta.from === undefined){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange delta contains no "from" value', graph)
					break 
				} else if(delta.to === undefined){
					malformedDeltaRejection(delta, appliedDeltas, 'propchange delta contains no "to" value', graph)
					break 
				}
				
				else {
					// console.log('\n\nincoming delta\n\n', delta)

					/*
					let [ctr, name] = findPathContainer(graph.nodes, delta.path);
					let o = ctr[name];
					// assert object & property exist:
					assert(o, "propchange failed: path not found");
					assert(o._props, "propchange failed: object has no _props");
					let prop = o._props[delta.name];
					assert(prop, "propchange failed: property not found");
					// assert 'from' value matches object's current value
					assert(deepEqual(prop, delta.from), "propchange failed; property value does not match");

					// change it:s
					o._props[delta.name] = delta.to;
					*/
					// 
					let [ctr, name] = findPathContainer(graph.nodes, delta.path);

					if (!ctr){

						// assert object & property exist:
						// throw ('propchange failed: path not found')
						// assert(o, "propchange failed: path not found");

					} 
					else {

						let o = ctr[name];
						let prop = o._props[delta.name];
						if(!o._props){

							//* i don't know what delta will trigger this:
							//* assert(o._props, "propchange failed: object has no _props");
						} else if (prop === undefined || prop === null){
							console.log(o)
							throw ('propchange failed: property not found')
						}
						
						//* propchange with incorrect from value

						//else if(delta.from != prop){
						// else if (!approximatelyEqual(delta.from, prop)){
						// 	//* reject propchange with incorrect value
						// 	throw `propchange failed for ${delta.path}:${delta.name}: delta.from ${delta.from} does not match current property value ${prop}`
						// 	// console.log(prevPropchange.to, delta.to)
						// 	//*TODO #1 Two propchanges with same path, same “from”, but different “to”
						// 	// if(deepEqual(prevPropchange && prevPropchange.path, delta.path) === true && prevPropchange.from === delta.from && prevPropchange.to != delta.to){
						// 	// 	throw "2 deltas w/ same path and from, different to"
						// 	// }
						// }
						
						
						// else if (previousDelta && delta.path === previousDelta.path && delta.from === previousDelta.from && previousDelta.to != delta.to){
						

						// }


						else if(previousDelta && delta.path === previousDelta.path && delta.from === previousDelta.from && previousDelta.to === delta.to){
							console.log('snared')
						}



			
						
						// // ! ensure that this does not result a false positive from a correct delta. 
						// else if (previousDelta !== undefined && deepEqual(delta.from, previousDelta.from) === true && deepEqual(delta.to, prop) === false){
							
							
						// 	console.log('current delta', delta, 'previousDelta', previousDelta)
						// 	console.log('delta.from', delta.from, 'prop', prop, 'delta.to', delta.to)
						// 	console.log('\n\nsame from, different to\n\n',  delta)

						// 	// throw ('test')

						// 	// Rebase fix by first applying B1, then inverting, 
						// 	// then A1, then applying a modified version of B1 (B1’) that has the corrected “from” value:
						// 	// B1: propchange @x, a->c
						// 	// o._props[delta.name] = delta.to;
						// 	// ^B1: propchange @x, c->a
						// 	//inverseDelta(delta)
						// 	// A1: propchange @x, a->b
						// 	//o._props[delta.name] = prop;
						// 	// B1*: propchange @x, b*->c
						// 	// applyDeltasToGraph = function (graph, delta)
						// 	// throw ('different to')


						//  } 
						// if the prop is an array, we need to deepEqual it instead of !=
						
						else if(typeof prop == 'object' && deepEqual(prop, delta.from) === false){
							let warningMsg = 'warning: propchange delta.from value ' + delta.from + 'does not match current value of ' + prop + ' in graph'
							conflictDeltaWarning(delta, appliedDeltas, warningMsg, graph)
							
							//TODO: for now, since I don't have a way to handle this conflict delta, apply propchange to graph
							o._props[delta.name] = delta.to;

						}
						else if (typeof prop != 'object' && prop != delta.from){
							let warningMsg = 'warning: propchange delta.from value ' + delta.from + 'does not match current value of ' + prop + ' in graph'
							conflictDeltaWarning(delta, appliedDeltas, warningMsg, graph)
							//TODO: for now, since I don't have a way to handle this conflict delta, apply propchange to graph
							o._props[delta.name] = delta.to;
						}
						
						else {
							// change it:
							o._props[delta.name] = delta.to;
							// console.log('correct delta', delta)

						}
						
						// // assert o._props match delta props:
						// for (let k in o._props) {
						// 	assert(deepEqual(o._props[k], delta[k]), "delnode failed; properties do not match");
						// }
						// // assert o has no child nodes
						// // keys should either be ['_props'] or just []:
						// let keys = Object.keys(o);
						// assert((keys.length == 1 && keys[0]=="_props") || keys.length == 0, "delnode failed; node has children");
						// delete ctr[name];
					}
					prevPropchange =  delta


				}

				
				//console.log('prev', previousDelta)
				// 
			} break;
		}
	}
	if(rejectionMsg){
		appliedDeltas = [];
		return [graph, rejectionMsg]
	} else {
		appliedDeltas = [];
		return graph;
	}
	
	
}

let makeGraph = function(deltas) {
	let graph = {
		nodes: {},
		arcs: []	
	};
	return graph;
}

let graphFromDeltas = function(deltas) {
	return applyDeltasToGraph(makeGraph(), deltas);
}

let deltasFromGraph = function(graph, deltas, pathprefix="") {
	nodesToDeltas(graph.nodes, deltas, pathprefix);

	for (let a of graph.arcs) {
		// TODO: assert that the paths exist?
		deltas.push({
			op: "connect",
			paths: [ a[0], a[1] ]
		})
	}
	return deltas;
}

function nodesToDeltas(nodes, deltas, pathprefix) {
	for (let name in nodes) {
		if (name == "_props") continue;
		let group = [];
		let n = nodes[name];
		let p = n._props;
		let d = copyProps(n._props, {
			op: "newnode", 
			path: pathprefix + name, 
		});
		group.push(d);
		// also push children:
		nodesToDeltas(n, group, pathprefix+name+".");

		deltas.push(group);
	}
	return deltas;
}

let propToString = function(prop) {
	if (typeof prop == "number") {
		return prop;
	} else if (typeof prop == "string") {
		return `"${prop}"`;
	} else if (Array.isArray(prop)) {
		return `[${prop.map(propToString).join(",")}]`
	}
}

let propsToString = function(props) {
	let res = [];
	for (let k of Object.keys(props)) {
		let v = props[k];
		
		res.push(`${k}=${propToString(v)}`)
	}
	return res.join(", ");
}

let nodeToString = function(node, indent) {
	let keys = Object.keys(node);
	let children = [];
	let props = "";
	if (node._props) {
		props = `[${propsToString(node._props, indent)}]`;
	}
	for (let key of keys) {
		if (key != "_props") {
			let s = `${"  ".repeat(indent)}${key} ${nodeToString(node[key], indent+1)}`;
			children.push(s);
		}
	}

	if (children.length > 0) {
		if (props) props += `\n`
		props += `${children.join("\n")}`;
	} 

	return props;
}

let graphToString = function(graph) {
	assert(graph.nodes);
	assert(graph.arcs);
	let arcstrings = [];
	for (let a of graph.arcs) {
		arcstrings.push(`\n${a[0]} -> ${a[1]}`);
	}
	return `${nodeToString(graph.nodes, 0)}${arcstrings.join("")}`;
}

let deltaToString = function(delta) {
	// { op:"newnode", path:"a", kind:"noise", pos:[10,10] }, 
	let args = [];
	for (let k of Object.keys(delta)) {
		if (k != "op" && k != "path" && k != "paths") {
			args.push(`${k}=${propToString(delta[k])}`);
		}
	}
	let path = delta.path;
	if (!path && delta.paths) {
		path = delta.paths.join(", ");
	}
	return `${delta.op} (${path}) ${args.join(", ")}`
}

let deltasToString = function(deltas, indent) {
	if (indent == undefined) indent = 0
	if (Array.isArray(deltas)) {
		return deltas.map(function(v) {
			return deltasToString(v, indent+1)
		}).join(`\n${"  ".repeat(indent)}`);
	} else {
		return deltaToString(deltas);
	}
}

let approximatelyEqual = function(x, y) {
	if (typeof x == "number" && typeof y == "number") {
		// ok if x or y are near zero, 
		// or the error is much smaller than the old value:		
		return 	(Math.abs(x) < 0.001 || Math.abs(y) < 0.001) 
		|| (Math.abs(x-y)/Math.abs(x)) < 0.001;
	} else if (Array.isArray(x) && Array.isArray(y)) {
		// TODO: this won't work for quaternions, because they are strange
		// console.log("comparing arrays", x, y)
		// if (x.length != y.length) throw `can't appoximate arrays of different length`
		// let ok = true;
		// for (let i=0; i<x.length; i++) {
		// 	console.log("comparing", x[i], y[i], approximatelyEqual(x[i], y[i]))
		// 	ok = ok && approximatelyEqual(x[i], y[i]);
		// }
		return true;//x.every((v,i)=>approximatelyEqual(v,y[i]));
	}
	throw `can't handle approximate equality for this type of data: ${typeof x}`
	
}





// find feedback paths in the graph

nodes = []
let adjacentCount = 0
let adjacents = {}
// let arcsLength
let nodeCount
let getNodes = function(localGraph){
    parents = Object.keys(localGraph.nodes)
    // let nodeCount = nodes.length
    // let arcsLength = localGraph.arcs.length
    for(i=0;i<parents.length;i++){
        let parent = Object.keys(localGraph.nodes)[i]
        let children = Object.keys(localGraph.nodes[parent])
        // need only the children that are outlets
        for(j=0;j<children.length;j++){
            if(localGraph.nodes[parent][children[j]]._props && localGraph.nodes[parent][children[j]]._props.kind === 'outlet'){
                let foo = parent + '.' + children[j]
                nodes.push(foo)
            }
            // console.log(localGraph.nodes[parent][children[j]]._props)
        }
        // console.log(parent, children, localGraph.nodes[parent]._props)
    }
    return nodes
}


    // // prepare a list of adjacent nodes for each node in the graph:
let getAdjacents = function (node, nodes, localGraph){
    let nodeName = nodes[node].split('.')[0]
    adjacents[nodeName] = []
    // if first iteration, do some setup
    arcsLength = localGraph.arcs.length
    nodeCount = nodes.length
    // does the current node connect to anything else? 
    for(i=0;i<arcsLength;i++){
        if(localGraph.arcs[i][0].split('.')[0] === nodes[node].split('.')[0]){
            adjacents[nodeName].push(localGraph.arcs[i])
        }    
        
   
    }
    // move onto next node
    if(adjacentCount < (nodeCount - 1)){
        adjacentCount++
        getAdjacents(adjacentCount, nodes, localGraph)
    } 
    // finished collecting adjacent nodes per each node, return the array    
    return adjacents
}

// getAdjacents(adjacentCount)


// // reset the nodes array with only the list of parent nodes that actually have connections:
// nodes.length = 0
// nodes = Object.keys(adjacents)
// nodeCount = nodes.length

// temp array of a given signal path
let signalPath = []
// collection of feedbackPaths (this is what we'll pass to the genScripting.js in order to determine where to place a history object!)
let feedbackPaths = []
// we'll use this as a lookup table to ensure we're not adding duplicate feedback paths i.e. node_2>node_3>node_4 === node_3>node_4>node_2 === node_4>node_2>node_3
let sortedFeedbackPaths = []
// keep track of each node visited in a given signal path
let visited = []

let newGraph
let graphReady = false

// async function clearVisited(nodeCount){
//     visited.length = 0
//     visited.length = nodeCount
//     for(j=0;j<nodeCount;j++){
//         visited[j] = false
//     } 
// }

let visit = function (node, nodes, adjacents, localGraph, nodeCount){
    // clearVisited(nodeCount).then(() =>{
        visited.length = 0
        visited.length = nodeCount
        for(j=0;j<nodeCount;j++){
            visited[j] = false
        } 
    
        visited[node] = true
        let nodeParent = nodes[node]
        
//         // console.log(nodeParent, visited)
        
        if(adjacents[nodeParent].length===0){
            // likely skip... this node has no adjacent nodes
        } else {

            // iterate the adjacency list of this node
            for(i=0;i<adjacents[nodeParent].length;i++){
                signalPath = []
                // start listing the signalPath, with the sourceNode first:
                signalPath.push(adjacents[nodeParent][i][0])                
                // console.log('node:', nodeParent, 'adjacent:', adjacents[nodeParent][i])
                let adjacentParent = adjacents[nodeParent][i][1].split('.')[0]
                let adjacentChild = adjacents[nodeParent][i][1]
                // if an adjacentParent does not appear in the list of nodes, 
                // it means its a terminal object, like a speaker 
                // (which has not outlets), and should be ignored
                if (nodes.includes(adjacentParent) === false) {
                    // ignore
                } else {
                    if(nodeParent === adjacentParent){
                        // detect a feedback path on only one node
                        signalPath.push(adjacentChild)
                        feedbackPaths.push(signalPath)
                        break
                    } else {
                        // the feedback path goes through more than one node!
                        
                        signalPath.push(adjacentChild)
                    }

                    let adjacentIndex = nodes.indexOf(adjacentParent)
                    let flag = visitUtil(adjacentParent, adjacentIndex, null, nodes, adjacents)
                    
                    if(flag === true){                   
                        if (feedbackPaths.length==0){
                            // console.log('firstFeedbackPath', signalPath)
                            feedbackPaths.push(signalPath)
                            checkDuplicatePaths(signalPath)
                        } else {
                            let uniquePath = checkDuplicatePaths(signalPath)
                            if(uniquePath === true){
                            
                                feedbackPaths.push(signalPath)
                            }
                            
                            flag = false
                        }
                    }
                }
            }
        }  
        if(visitCount < (nodeCount - 1)){
            // move on to next node in graph
            
            visitCount++
            visit(visitCount, nodes, adjacents, localGraph, nodeCount)
        } else {
            // all nodes & their adjacent nodes have been visited.
            // console.log(applyHistoryToGraph(feedbackPaths, localGraph))
            // return applyHistoryToGraph(feedbackPaths, localGraph)
            // newGraph = applyHistoryToGraph(feedbackPaths, localGraph)
            graphReady = true
        }
    // once the graph has been updated with location of feedback paths
    // return it
    if(graphReady===true){
        
        return feedbackPaths
    }
    
}
visitCount = 0
// visit(visitCount)

function visitUtil(name, index, arc, nodes, adjacents){
    if(visited[index] == true){

        visited[index] = false
        if(arc){
            signalPath.push(arc[0], arc[1])
        }
        return true
    }
    visited[index] = true
    let flag = false
    // console.log('current signalPath:', signalPath, 'checking adjacents[name]', adjacents[name])
    
    for(i=0;i<adjacents[name].length;i++){
        //  console.log('looking at new adjacent arc:', adjacents[name][i])
        //  console.log('adjacent node is:', adjacents[name][i][1])
        //  console.log('adjacent node parent is:', adjacents[name][i][1].split('.')[0])
        let adjacentArc = adjacents[name][i]
        let adjacentChild = adjacents[name][i][1]
        let adjacentParent = adjacents[name][i][1].split('.')[0]
        // ignore terminal modules (i.e. a speaker has no outlets) || ignore an adjacent node that itself has no adjacent nodes
        if (nodes.includes(adjacentParent) === false || adjacents[name].length===0 || adjacents[adjacentParent].length ===0) {
            // ignore
        } else {
            // check if signalpath already includes the adjacent parent as SOURCE node
            // get each of the SOURCE parentNodes in the signalPath
            // console.log('signalPath up to now is:',signalPath)
            sourceNodes = signalPath.filter((element, index) => {
                return index % 2 === 0;
            }) 
            // console.log("sourceNodes", sourceNodes)
            let sourceParents = []
            
            for( j=0;j < sourceNodes.length;j++){
                // console.log('sourceNodes[j].split(".")[0]', sourceNodes[j].split('.')[0])
                newParent = sourceNodes[j].split('.')[0]
                sourceParents.push(newParent)
            }
        
            // don't add a duplicate && make sure you're adding one that belongs
            if(sourceParents.includes(adjacentParent) === false){
                signalPath.push(adjacentArc[0], adjacentArc[1])
            }      
            

            let adjacentIndex = nodes.indexOf(adjacents[name][i][1].split('.')[0])
            // console.log("adjacents[name][i][1].split('.')[0]", adjacents[name][i][1].split('.')[0], 'adjacentIndex', adjacentIndex)
            flag = visitUtil(adjacentParent, adjacentIndex, adjacentArc, nodes, adjacents)
            if(flag == true){
                return true
            }
        // //     }
        }
    }
    return false
}

function checkDuplicatePaths(checkPath){
    let tempArr = []
    for(i=0;i<checkPath.length;i++){
        tempArr.push(checkPath[i])
    }

    tempArr.sort()

    for(i=0;i<sortedFeedbackPaths.length;i++){
        // if the exact feedback path already exists (just in a different order)
        if(equals(sortedFeedbackPaths[i], tempArr)){
            return false
        }
    }
    sortedFeedbackPaths.push(tempArr)
    return true
}

module.exports = {
	makeGraph: makeGraph,

	graphFromDeltas: graphFromDeltas,
	deltasFromGraph: deltasFromGraph,
	inverseDelta: inverseDelta,
	applyDeltasToGraph: applyDeltasToGraph,
	nodesToDeltas: nodesToDeltas,

	// utils:
	findPathContainer: findPathContainer,
	graphToString: graphToString,
	deltasToString: deltasToString,

	deepEqual: deepEqual,
	deepCopy: deepCopy,

	// find feedback paths in the graph
	getNodes: getNodes,
	getAdjacents: getAdjacents,
	visit: visit

}
