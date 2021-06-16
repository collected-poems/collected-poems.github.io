
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.head.appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                let j = 0;
                while (j < node.attributes.length) {
                    const attribute = node.attributes[j];
                    if (attributes[attribute.name]) {
                        j++;
                    }
                    else {
                        node.removeAttribute(attribute.name);
                    }
                }
                return nodes.splice(i, 1)[0];
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function sample(array) {
      return array[Math.floor(Math.random()*array.length)];
    }

    function range(n,n2) {
      const rng = [];
      if (n2) {
        for (let i = n; i < n2; i++) {
          rng.push(i);
        }
      } else {
        for (let i = 0; i < n; i++) {
          rng.push(i);
        }
      }
      return rng;
    }

    if (typeof(String.prototype.trim) === "undefined") {
      String.prototype.trim = function() {
        return String(this).replace(/^\s+|\s+$/g, '');
      };
    }

    const raw = `I saw you many years later,
Your skin like the paper of onions.
I wondered if it was finally thin enough
To get through,
At least to the next layer.
But beneath you were the same.
Each version of you hid
An identical other,
Almost as if the hiding itself
Was the secret.
What foolish anxieties
Of anxiousness
We harbor;
That arduous ardor
We push even harder
Into our deepest bellies
Whose depth is belied
By their harlequin mirrors;
Each little death denied,
Each deviant Dürer-grid
Over onion eyes
Weeping (from) their own sulfur
Disguise

--

#identity
#parental-love
#sonnet

~

overdescription tampers
hammer-blows to a chisel
on a prism of marble
too often i cannot extract a shape
coolly examining from all angles
the strange sheen
of what the words have left behind
i cut it down smaller
but look, a flaw

When all I wanted to say was,
"I was thinking about you"
a description of an event
murmurs over the inscription
I'd hoped would be stenciled
in the smooth shiny base
the dust in the sunbeams
augmenting perfectly the trace,
the seems, and the flourish
please forgive the clumsiness of my love

--

#mental-health

~

breaking / news
the fracture edges dribbling inklets into bruise-
puddles on the litany of skin
a scant achievement,
turning in the tears within.
a coal-y war whereby
the burning for the center of the sky
is high
the city-scapes skip scampering
like weasels over wharves
and fat dunes frantic in the carves
of wind on sand
feel my hand
with what it gropes
there are hopes
too antic for romance
and fancy favors filaments
of grace
i cannot trace
the tremors of the human race.

--

#climate

~

Imbued with somewhat elegance
we tremble in the travel of a mind
the pieces of orange rind
we put into a bowl to dance
the spindle marimba mistletoe
in pearl.
There were girls and boys
sorting through a bucket of toys
there were paper ribbons
scattered like light off glass dust
there were crusts of half-eaten pies
and passages of bible verses
torn from trees
scorn from skiers trekking up
the mountain majestations
mention of a name
and very drop of hat
a soft felt clasp
of fingers faltered fumbled
at the task
they tumbled out like jacks
into the scene,
south slacks silvered
not so slender
but a salvo smothered
onto skin
foundation, ferox infantuation
cloroxed, peachy white
bleachnight
numbers, names, and nodules
nimble in the throttling of light
a bottled beachball
bothered by the heatlight
lamp-caressed
the bursting curves
of a leather chair
your hairswerves
magic into traffic
median deserves
no tragic, Grecian nerves
sporadic, stately
Johnny-come-lately
logic looming lithe
like lukeblonde doom
cordon off the room
and bored in bloom
the leopolds will leak
their fruits of loom

--

#sexuality
#hopkins
#joyce

~

A new document
A plain lament
To fill its lines
The simple signs
On endless roads,
Meaning endlessness
I'll send you this
These words I've trod
I'll trek by milky lakes
And crisp underfoot vines mistakes
I'll crinkle up crimes
Between my hands,
And blow into them with bright eyes
Collecting sand
Within my fist,
We note this top hourglass bulb
Is dwarfed by its counterpart,
The world

~

Isabel
Of Israel
Meanders through the garden
Wishing well
With fishy smell
Her midair answers harden

And fall to ground
Atop a mound
And sprout into the humus
There is a sound
Here always found
That seems not to come from us

The leaves are green
And through their sheen
A sheepish shoot is shining
There is a keen
Care cradling
The sleeper's earthly whining

This little babe
That I have mabe
And will become a man
Is laid to rest
Against the breast
Of everything I am

--

#race
#religion

~

What is given
and what is graven
will it be that I will carry
all the dreams that cats rub off on me
smearing their open lips across my leg, or cheeks
with just a hint of teeth?
And will I nobly carry these baubles
these iridescent marbles
in my hands and in my sweatpants pockets
through halls of open doors
and wide courtyards full of chatting toga’d people?
And will so laden
I be baden
by a slender tender
sliver of a maiden
growing wider
the life inside her
like a toenail moon swells
into a bone-white balloon?
or a bleached expanse of shells
muttering to themselves on a beach
like the night sky, each
oblivious of all
crabs scuttle through the shawl
of surf playfully removed
and worn again
and finally dissolved?

--

#sexuality
#expectations

~

He fathers forth, whose beauty is past change
(plague-arising of the sun I know I know)
a single love for everyone
a slow, gelatinous realization
so much more malleable than Truth
but far less fragile;
you are a house made of butterfly wings
once you let someone in, your flight will cease
yellow pollenpowder nose you cute little creampuff beast
you're not so tough, but ne'er am I.
It's not the halfway compromise, the weathered crease
of parchment lying under the proclamation, either.
That shit's half bug too,
article five insect.ion three false positive of the free.
He's not there in the crackling of the pages
but the mucous curdling in the sugary eyes
of the sages, tourists, and others scanning, poking, like flies.
Read em' and weep,
bleed out your seed and weed what you reap,
end so nothing can amend
go back to sleep, my friend
He's not there in the self-deception
itself but its structure and inception;
we knew the answer was love long ago,
but we never saw where they shoved it,
how far they made it go,
dreams beyond dreams,
lakes beyond pools beyond streams,
how slowly, gelatinously they gained its trust,
brusquely shared its bliss, its trysts,
and made it an accomplice.
we knew it was the culprit all along,
but we never understood the mystery,
never saw in the discarded insect shells its history,
as we would its future have read from cast bones or tarot,
auguries of providence in fallen sparrows,
or felt it in the spit of fall, the August breeze-narrows,
all the bronze pollen tickling your nose...
we ignored it, not coming from a rose.
But now I have a chance to see it again,
as I cross the auburn threshold of the monarch's mansion wings,
within the house, not looking for any kings
but just for you, for how you made it,
watching you trace your hands and his in the black cross-beams,
wanting to hold them, so dulcet-ductile, dappled,
their paths of copper beaten into hairlike strands,
brass wedding bands of DNA--AND golden sunlight in the seams,
appled to be eaten, our sacrifice to be made reversible,
submersible in the electric bronze fluid of time,
dreams within dreams, ionic bond sewage
I finally see you through the liquid lens a new age, past change,
druidic and different but monotheistic all the same,
I finally see you how you built yourself, inside your fame,
and seeing you I see him too, and call him by your name.
Phrase him.

--

#science
#religion
#hopkins`;


    const poemArray = raw.split(/^~$/m).map(s => s.trim()).map((s,index) => {
      const poemParts = s.split(/^--$/m);

      const text = poemParts[0].trim();

      let id = text.split("\n")[0].trim();
      id = id.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      id = encodeURIComponent(id);

      let tags = [];
      if (poemParts.length == 2) {
        tags = poemParts[1].match(/#[a-z]+/gm).map(s => s.slice(1));
      } else if (poemParts.length >= 3) {
        console.log("couldn't parse tags from this poem:");
        console.log(s);
        return {};
      }
      return { id, text, tags, index };
    });

    const poemIds = poemArray.map(p => p.id);
    const poems = {};
    const tagsToPoemIds = {};
    const tags = new Set([]);

    for (let p of poemArray) {
      poems[p.id] = p;
      for (let tag of p.tags) {
        tags.add(tag);
        if (tagsToPoemIds[tag]) {
          tagsToPoemIds[tag].add(p.id);
        } else {
          tagsToPoemIds[tag] = new Set([p.id]);
        }
      }
    }

    function pidsFor(tag) {
      if (tag) {
        const res = Array.from(tagsToPoemIds[tag]);
        console.log(res);
        return res;
      } else {
        return poemIds;
      }
    }

    /* src/App.svelte generated by Svelte v3.20.1 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (26:4) {#each poem.tags as t}
    function create_each_block(ctx) {
    	let a;
    	let t_value = /*t*/ ctx[6] + "";
    	let t;
    	let dispose;

    	return {
    		c() {
    			a = element("a");
    			t = text(t_value);
    			this.h();
    		},
    		l(nodes) {
    			a = claim_element(nodes, "A", { href: true });
    			var a_nodes = children(a);
    			t = claim_text(a_nodes, t_value);
    			a_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(a, "href", "javascript:void(0)");
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			append(a, t);
    			if (remount) dispose();

    			dispose = listen(a, "click", function () {
    				if (is_function(/*tag*/ ctx[0] = /*t*/ ctx[6])) (/*tag*/ ctx[0] = /*t*/ ctx[6]).apply(this, arguments);
    			});
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			dispose();
    		}
    	};
    }

    function create_fragment(ctx) {
    	let main;
    	let nav0;
    	let a0;
    	let t0;
    	let t1;
    	let a1;
    	let t2;
    	let t3;
    	let a2;
    	let t4;
    	let t5;
    	let a3;
    	let t6;
    	let t7;
    	let a4;
    	let t8;
    	let t9;
    	let nav1;
    	let dispose;
    	let each_value = /*poem*/ ctx[3].tags;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			main = element("main");
    			nav0 = element("nav");
    			a0 = element("a");
    			t0 = text("first");
    			t1 = space();
    			a1 = element("a");
    			t2 = text("prev");
    			t3 = space();
    			a2 = element("a");
    			t4 = text("rand");
    			t5 = space();
    			a3 = element("a");
    			t6 = text("next");
    			t7 = space();
    			a4 = element("a");
    			t8 = text("last");
    			t9 = space();
    			nav1 = element("nav");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			main = claim_element(nodes, "MAIN", {});
    			var main_nodes = children(main);
    			nav0 = claim_element(main_nodes, "NAV", {});
    			var nav0_nodes = children(nav0);
    			a0 = claim_element(nav0_nodes, "A", { href: true });
    			var a0_nodes = children(a0);
    			t0 = claim_text(a0_nodes, "first");
    			a0_nodes.forEach(detach);
    			t1 = claim_space(nav0_nodes);
    			a1 = claim_element(nav0_nodes, "A", { href: true });
    			var a1_nodes = children(a1);
    			t2 = claim_text(a1_nodes, "prev");
    			a1_nodes.forEach(detach);
    			t3 = claim_space(nav0_nodes);
    			a2 = claim_element(nav0_nodes, "A", { href: true });
    			var a2_nodes = children(a2);
    			t4 = claim_text(a2_nodes, "rand");
    			a2_nodes.forEach(detach);
    			t5 = claim_space(nav0_nodes);
    			a3 = claim_element(nav0_nodes, "A", { href: true });
    			var a3_nodes = children(a3);
    			t6 = claim_text(a3_nodes, "next");
    			a3_nodes.forEach(detach);
    			t7 = claim_space(nav0_nodes);
    			a4 = claim_element(nav0_nodes, "A", { href: true });
    			var a4_nodes = children(a4);
    			t8 = claim_text(a4_nodes, "last");
    			a4_nodes.forEach(detach);
    			nav0_nodes.forEach(detach);
    			t9 = claim_space(main_nodes);
    			nav1 = claim_element(main_nodes, "NAV", {});
    			var nav1_nodes = children(nav1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(nav1_nodes);
    			}

    			nav1_nodes.forEach(detach);
    			main_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(a0, "href", "javascript:void(0)");
    			attr(a1, "href", "javascript:void(0)");
    			attr(a2, "href", "javascript:void(0)");
    			attr(a3, "href", "javascript:void(0)");
    			attr(a4, "href", "javascript:void(0)");
    		},
    		m(target, anchor, remount) {
    			insert(target, main, anchor);
    			append(main, nav0);
    			append(nav0, a0);
    			append(a0, t0);
    			append(nav0, t1);
    			append(nav0, a1);
    			append(a1, t2);
    			append(nav0, t3);
    			append(nav0, a2);
    			append(a2, t4);
    			append(nav0, t5);
    			append(nav0, a3);
    			append(a3, t6);
    			append(nav0, t7);
    			append(nav0, a4);
    			append(a4, t8);
    			append(main, t9);
    			append(main, nav1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(nav1, null);
    			}

    			if (remount) run_all(dispose);

    			dispose = [
    				listen(a0, "click", function () {
    					if (is_function(/*i*/ ctx[1] = 0)) (/*i*/ ctx[1] = 0).apply(this, arguments);
    				}),
    				listen(a1, "click", function () {
    					if (is_function(/*i*/ ctx[1] = Math.max(/*i*/ ctx[1] - 1, 0))) (/*i*/ ctx[1] = Math.max(/*i*/ ctx[1] - 1, 0)).apply(this, arguments);
    				}),
    				listen(a2, "click", function () {
    					if (is_function(/*i*/ ctx[1] = sample(range(/*n*/ ctx[2])))) (/*i*/ ctx[1] = sample(range(/*n*/ ctx[2]))).apply(this, arguments);
    				}),
    				listen(a3, "click", function () {
    					if (is_function(/*i*/ ctx[1] = Math.max(/*i*/ ctx[1] + 1, /*n*/ ctx[2] - 1))) (/*i*/ ctx[1] = Math.max(/*i*/ ctx[1] + 1, /*n*/ ctx[2] - 1)).apply(this, arguments);
    				}),
    				listen(a4, "click", function () {
    					if (is_function(/*i*/ ctx[1] = /*n*/ ctx[2] - 1)) (/*i*/ ctx[1] = /*n*/ ctx[2] - 1).apply(this, arguments);
    				})
    			];
    		},
    		p(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*tag, poem*/ 9) {
    				each_value = /*poem*/ ctx[3].tags;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(nav1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_each(each_blocks, detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { tag = null } = $$props;
    	const pids = pidsFor(tag);
    	const n = pids.length;
    	let { i = 1 } = $$props;
    	const pid = pids[i];
    	const poem = poems[pid];

    	$$self.$set = $$props => {
    		if ("tag" in $$props) $$invalidate(0, tag = $$props.tag);
    		if ("i" in $$props) $$invalidate(1, i = $$props.i);
    	};

    	return [tag, i, n, poem];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { tag: 0, i: 1 });
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
