/**
 * A complete rewrite of a Lua 5.1 bytecode VM in JavaScript.
 * This implementation can execute Lua 5.1 bytecode and interface with a
 * user-provided JavaScript environment for global variables and functions.
 */
function createLuaVM() {

    //================================================================================
    // Part 1: Bitwise Operations and Table Utilities
    //
    // Implements the 'bit' library and Lua's 'table' utility functions
    // required by the original script.
    //================================================================================

    const bit = {
        /** Unsigned right shift */
        rshift: (x, y) => x >>> y,
        /** Left shift */
        lshift: (x, y) => x << y,
        /** Bitwise AND */
        band: (x, y) => x & y,
    };

    const table = {
        /** Creates a new array. */
        create: (_) => [],
        /** Unpacks elements of an array. In JS, this is best handled by slicing. */
        unpack: (arr, first = 1, last = arr.length) => arr.slice(first - 1, last),
        /**
         * Packs arguments into an array-like object.
         * The 'n' property stores the number of arguments.
         */
        pack: (...args) => {
            const result = { n: args.length };
            args.forEach((val, i) => result[i + 1] = val);
            // Also add them to a proper array for easier iteration if needed
            Object.defineProperty(result, 'array', { value: args, enumerable: false });
            return result;
        },
        /** Moves a sequence of elements from a source array to a destination array. */
        move: (src, first, last, offset, dst) => {
            for (let i = 0; i <= last - first; i++) {
                dst[offset + i] = src[first + i];
            }
        }
    };

    //================================================================================
    // Part 2: Lua VM Constants
    //
    // These constants define the structure and mapping of Lua 5.1 opcodes.
    //================================================================================

    const FIELDS_PER_FLUSH = 50;

    // Maps original opcodes to a continuous sequence.
    const OPCODE_RM = {
        [22]: 18, [31]: 8,  [33]: 28, [0]: 3,   [1]: 13,  [2]: 23,
        [26]: 33, [12]: 1,  [13]: 6,  [14]: 10,  [15]: 16,  [16]: 20,
        [17]: 26, [18]: 30, [19]: 36, [3]: 0,   [4]: 2,   [5]: 4,
        [6]: 7,   [7]: 9,  [8]: 12,  [9]: 14,  [10]: 17,  [20]: 19,
        [21]: 22, [23]: 24, [24]: 27, [25]: 29, [27]: 32, [32]: 34,
        [34]: 37, [11]: 5,  [28]: 11, [29]: 15, [30]: 21, [35]: 25,
        [36]: 31, [37]: 35,
    };

    // Defines the argument format for each original opcode.
    const OPCODE_T = [
        'ABC', 'ABx', 'ABC', 'ABC', 'ABC', 'ABx', 'ABC', 'ABx', 'ABC', 'ABC',
        'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC',
        'ABC', 'ABC', 'AsBx', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC', 'ABC',
        'ABC', 'AsBx', 'AsBx', 'ABC', 'ABC', 'ABC', 'ABx', 'ABC',
    ];

    // Defines the argument modes (e.g., register, constant) for each original opcode.
    const OPCODE_M = [
        { b: 'OpArgR', c: 'OpArgN' }, { b: 'OpArgK', c: 'OpArgN' },
        { b: 'OpArgU', c: 'OpArgU' }, { b: 'OpArgR', c: 'OpArgN' },
        { b: 'OpArgU', c: 'OpArgN' }, { b: 'OpArgK', c: 'OpArgN' },
        { b: 'OpArgR', c: 'OpArgK' }, { b: 'OpArgK', c: 'OpArgN' },
        { b: 'OpArgU', c: 'OpArgN' }, { b: 'OpArgK', c: 'OpArgK' },
        { b: 'OpArgU', c: 'OpArgU' }, { b: 'OpArgR', c: 'OpArgK' },
        { b: 'OpArgK', c: 'OpArgK' }, { b: 'OpArgK', c: 'OpArgK' },
        { b: 'OpArgK', c: 'OpArgK' }, { b: 'OpArgK', c: 'OpArgK' },
        { b: 'OpArgK', c: 'OpArgK' }, { b: 'OpArgK', c: 'OpArgK' },
        { b: 'OpArgR', c: 'OpArgN' }, { b: 'OpArgR', c: 'OpArgN' },
        { b: 'OpArgR', c: 'OpArgN' }, { b: 'OpArgR', c: 'OpArgR' },
        { b: 'OpArgR', c: 'OpArgN' }, { b: 'OpArgK', c: 'OpArgK' },
        { b: 'OpArgK', c: 'OpArgK' }, { b: 'OpArgK', c: 'OpArgK' },
        { b: 'OpArgR', c: 'OpArgU' }, { b: 'OpArgR', c: 'OpArgU' },
        { b: 'OpArgU', c: 'OpArgU' }, { b: 'OpArgU', c: 'OpArgU' },
        { b: 'OpArgU', c: 'OpArgN' }, { b: 'OpArgR', c: 'OpArgN' },
        { b: 'OpArgR', c: 'OpArgN' }, { b: 'OpArgN', c: 'OpArgU' },
        { b: 'OpArgU', c: 'OpArgU' }, { b: 'OpArgN', c: 'OpArgN' },
        { b: 'OpArgU', c: 'OpArgN' }, { b: 'OpArgU', c: 'OpArgN' },
    ];


    //================================================================================
    // Part 3: Binary Data Readers
    //
    // Functions to parse integers and floating-point numbers from a binary
    // string, handling different sizes and endianness.
    //================================================================================

    function rd_int_basic(src, s, e, d) {
        let num = 0;
        const start = d > 0 ? s : e;
        for (let i = s; i !== e + d; i += d) {
            const mul = Math.pow(256, Math.abs(i - start));
            // Adjust for 0-based string indexing in JS
            num += mul * src.charCodeAt(i - 1);
        }
        return num;
    }

    function rd_flt_basic(f1, f2, f3, f4) {
        const sign = (-1) ** bit.rshift(f4, 7);
        const exp = bit.rshift(f3, 7) + bit.lshift(bit.band(f4, 0x7f), 1);
        const frac = f1 + bit.lshift(f2, 8) + bit.lshift(bit.band(f3, 0x7f), 16);
        let normal = 1;

        if (exp === 0) {
            if (frac === 0) return sign * 0;
            normal = 0;
            exp = 1;
        } else if (exp === 0xff) { // Lua 5.1 uses 0xff, not 0x7f
            if (frac === 0) return sign * Infinity;
            return sign * NaN;
        }

        return sign * (2 ** (exp - 127)) * (normal + frac / 8388608);
    }

    function rd_dbl_basic(f1, f2, f3, f4, f5, f6, f7, f8) {
        const sign = (-1) ** bit.rshift(f8, 7);
        const exp = bit.lshift(bit.band(f8, 0x7f), 4) + bit.rshift(f7, 4);
        let frac = bit.band(f7, 0xf) * 281474976710656;
        let normal = 1;

        frac += (f6 * 1099511627776) + (f5 * 4294967296) + (f4 * 16777216) + (f3 * 65536) + (f2 * 256) + f1;

        if (exp === 0) {
            if (frac === 0) return sign * 0;
            normal = 0;
            exp = 1;
        } else if (exp === 0x7ff) {
            if (frac === 0) return sign * Infinity;
            return sign * NaN;
        }
        return sign * (2 ** (exp - 1023)) * (normal + frac / 4503599627370496);
    }

    const rd_int_le = (src, s, e) => rd_int_basic(src, s, e - 1, 1);
    const rd_int_be = (src, s, e) => rd_int_basic(src, e - 1, s, -1);

    const rd_flt_le = (src, s) => rd_flt_basic(src.charCodeAt(s - 1), src.charCodeAt(s), src.charCodeAt(s + 1), src.charCodeAt(s + 2));
    const rd_flt_be = (src, s) => rd_flt_basic(src.charCodeAt(s + 2), src.charCodeAt(s + 1), src.charCodeAt(s), src.charCodeAt(s - 1));

    const rd_dbl_le = (src, s) => rd_dbl_basic(
        ...Array.from({ length: 8 }, (_, i) => src.charCodeAt(s - 1 + i))
    );
    const rd_dbl_be = (src, s) => rd_dbl_basic(
        ...Array.from({ length: 8 }, (_, i) => src.charCodeAt(s - 1 + (7 - i))).reverse()
    );

    const float_types = {
        4: { little: rd_flt_le, big: rd_flt_be },
        8: { little: rd_dbl_le, big: rd_dbl_be },
    };


    //================================================================================
    // Part 4: Bytecode Stream Deserializer
    //
    // These functions read structured data (like instructions, constants, and
    // function prototypes) from the bytecode stream.
    //================================================================================

    function stm_byte(S) {
        const bt = S.source.charCodeAt(S.index - 1);
        S.index++;
        return bt;
    }

    function stm_string(S, len) {
        const pos = S.index + len;
        const str = S.source.substring(S.index - 1, pos - 1);
        S.index = pos;
        return str;
    }

    const cst_int_rdr = (len, func) => (S) => {
        const pos = S.index + len;
        const int = func(S.source, S.index, pos);
        S.index = pos;
        return int;
    };

    const cst_flt_rdr = (len, func) => (S) => {
        const flt = func(S.source, S.index);
        S.index += len;
        return flt;
    };

    function stm_lstring(S) {
        const len = S.s_szt(S);
        if (len === 0) return null;
        // The last character is a null terminator, which we strip.
        return stm_string(S, len).slice(0, -1);
    }

    function stm_inst_list(S) {
        const len = S.s_int(S);
        const list = [null]; // 1-indexed

        for (let i = 1; i <= len; i++) {
            const ins = S.s_ins(S);
            const op = bit.band(ins, 0x3f);
            const args = OPCODE_T[op];
            const mode = OPCODE_M[op];
            const data = {
                value: ins,
                op: OPCODE_RM[op],
                A: bit.band(bit.rshift(ins, 6), 0xff),
            };

            if (args === 'ABC') {
                data.B = bit.band(bit.rshift(ins, 23), 0x1ff);
                data.C = bit.band(bit.rshift(ins, 14), 0x1ff);
                data.is_KB = mode.b === 'OpArgK' && data.B > 0xff;
                data.is_KC = mode.c === 'OpArgK' && data.C > 0xff;
            } else if (args === 'ABx') {
                data.Bx = bit.band(bit.rshift(ins, 14), 0x3ffff);
                data.is_K = mode.b === 'OpArgK';
            } else if (args === 'AsBx') {
                data.sBx = bit.band(bit.rshift(ins, 14), 0x3ffff) - 131071;
            }
            list[i] = data;
        }
        return list;
    }

    function stm_const_list(S) {
        const len = S.s_int(S);
        const list = [null]; // 1-indexed

        for (let i = 1; i <= len; i++) {
            const tt = stm_byte(S);
            let k = null;
            if (tt === 0) { // LUA_TNIL
                k = null;
            } else if (tt === 1) { // LUA_TBOOLEAN
                k = stm_byte(S) !== 0;
            } else if (tt === 3) { // LUA_TNUMBER
                k = S.s_num(S);
            } else if (tt === 4) { // LUA_TSTRING
                k = stm_lstring(S);
            }
            list[i] = k;
        }
        return list;
    }
    
    // Forward declaration
    let stm_lua_func; 

    function stm_sub_list(S, src) {
        const len = S.s_int(S);
        const list = [null]; // 1-indexed
        for (let i = 1; i <= len; i++) {
            list[i] = stm_lua_func(S, src);
        }
        return list;
    }

    function stm_line_list(S) {
        const len = S.s_int(S);
        const list = [null]; // 1-indexed
        for (let i = 1; i <= len; i++) {
            list[i] = S.s_int(S);
        }
        return list;
    }

    function stm_loc_list(S) {
        const len = S.s_int(S);
        const list = [null]; // 1-indexed
        for (let i = 1; i <= len; i++) {
            list[i] = {
                varname: stm_lstring(S),
                startpc: S.s_int(S),
                endpc: S.s_int(S),
            };
        }
        return list;
    }

    function stm_upval_list(S) {
        const len = S.s_int(S);
        const list = [null]; // 1-indexed
        for (let i = 1; i <= len; i++) {
            list[i] = stm_lstring(S);
        }
        return list;
    }

    stm_lua_func = function(S, psrc) {
        const proto = {};
        const src = stm_lstring(S) || psrc;
        proto.source = src;

        S.s_int(S); // linedefined
        S.s_int(S); // lastlinedefined

        proto.num_upval = stm_byte(S);
        proto.num_param = stm_byte(S);
        proto.is_vararg = stm_byte(S);
        proto.max_stack = stm_byte(S);
        proto.code = stm_inst_list(S);
        proto.const = stm_const_list(S);
        proto.subs = stm_sub_list(S, src);
        proto.lines = stm_line_list(S);
        
        // These are not used by the VM but are part of the format.
        stm_loc_list(S);
        stm_upval_list(S);

        proto.needs_arg = bit.band(proto.is_vararg, 0x5) === 0x5;

        // Pre-process constants for faster access during execution
        proto.code.forEach(v => {
            if (v) {
                if (v.is_K) {
                    v.const = proto.const[v.Bx + 1];
                } else {
                    if (v.is_KB) v.const_B = proto.const[v.B - 0xff];
                    if (v.is_KC) v.const_C = proto.const[v.C - 0xff];
                }
            }
        });

        return proto;
    }
    
    /**
     * Main deserialization function. Converts bytecode string into a state prototype.
     * @param {string} src - The raw bytecode as a string.
     * @returns {object} The main function prototype.
     */
    function lua_bc_to_state(src) {
        const stream = { index: 1, source: src };

        if (stm_string(stream, 4) !== '\x1bLua') throw new Error('Invalid Lua signature');
        if (stm_byte(stream) !== 0x51) throw new Error('Invalid Lua version');
        if (stm_byte(stream) !== 0) throw new Error('Invalid Lua format');

        const little = stm_byte(stream) !== 0;
        const size_int = stm_byte(stream);
        const size_szt = stm_byte(stream);
        const size_ins = stm_byte(stream);
        const size_num = stm_byte(stream);
        const flag_int = stm_byte(stream) !== 0;

        const rdr_func = little ? rd_int_le : rd_int_be;
        stream.s_int = cst_int_rdr(size_int, rdr_func);
        stream.s_szt = cst_int_rdr(size_szt, rdr_func);
        stream.s_ins = cst_int_rdr(size_ins, rdr_func);

        if (flag_int) {
            stream.s_num = cst_int_rdr(size_num, rdr_func);
        } else if (float_types[size_num]) {
            const endian = little ? 'little' : 'big';
            stream.s_num = cst_flt_rdr(size_num, float_types[size_num][endian]);
        } else {
            throw new Error('Unsupported float size');
        }

        return stm_lua_func(stream, '@virtual');
    }


    //================================================================================
    // Part 5: VM Execution Engine
    //
    // This is the core of the virtual machine, including the main execution
    // loop and functions for managing the call stack and upvalues.
    //================================================================================

    function close_lua_upvalues(list, index) {
        for (const i in list) {
            const uv = list[i];
            if (uv.index >= index) {
                uv.value = uv.store[uv.index];
                uv.store = uv;
                uv.index = 'value'; // Mark as closed
                delete list[i];
            }
        }
    }

    function open_lua_upvalue(list, index, memory) {
        let prev = list[index];
        if (!prev) {
            prev = { index, store: memory };
            list[index] = prev;
        }
        return prev;
    }

    function on_lua_error(failed, err) {
        const src = failed.source;
        const line = failed.lines[failed.pc - 1] || '?';
        const errorMsg = `${src}:${line}: ${err.message || err}`;
        throw new Error(errorMsg);
    }
    
    function run_lua_func(state, env, upvals) {
        const code = state.code;
        const subs = state.subs;
        const vararg = state.vararg;
        let top_index = -1;
        const open_list = {};
        const memory = state.memory;
        let pc = state.pc;
        
        while (true) {
            const inst = code[pc];
            const op = inst.op;
            pc++;

            switch (op) {
                //-- OP_MOVE
                case 0: memory[inst.A] = memory[inst.B]; break;
                //-- OP_LOADK
                case 1: memory[inst.A] = inst.const; break;
                //-- OP_GETGLOBAL
                case 2: memory[inst.A] = env[inst.const]; break;
                //-- OP_LOADNIL
                case 3: for (let i = inst.A; i <= inst.B; i++) memory[i] = null; break;
                //-- OP_GETUPVAL
                case 4: const uv_get = upvals[inst.B]; memory[inst.A] = uv_get.store[uv_get.index]; break;
                //-- OP_SETGLOBAL
                case 5: env[inst.const] = memory[inst.A]; break;
                //-- OP_SETUPVAL
                case 6: const uv_set = upvals[inst.B]; uv_set.store[uv_set.index] = memory[inst.A]; break;
                //-- OP_GETTABLE
                case 7: memory[inst.A] = memory[inst.B][inst.is_KC ? inst.const_C : memory[inst.C]]; break;
                //-- OP_SETTABLE
                case 8: memory[inst.A][inst.is_KB ? inst.const_B : memory[inst.B]] = inst.is_KC ? inst.const_C : memory[inst.C]; break;
                //-- OP_NEWTABLE
                case 9: memory[inst.A] = {}; break; // JS objects act as Lua tables
                //-- OP_SELF
                case 10: {
                    const A = inst.A, B = inst.B;
                    const idx = inst.is_KC ? inst.const_C : memory[inst.C];
                    memory[A + 1] = memory[B];
                    memory[A] = memory[B][idx];
                    break;
                }
                //-- OP_ADD
                case 11: memory[inst.A] = (inst.is_KB ? inst.const_B : memory[inst.B]) + (inst.is_KC ? inst.const_C : memory[inst.C]); break;
                //-- OP_SUB
                case 12: memory[inst.A] = (inst.is_KB ? inst.const_B : memory[inst.B]) - (inst.is_KC ? inst.const_C : memory[inst.C]); break;
                //-- OP_MUL
                case 13: memory[inst.A] = (inst.is_KB ? inst.const_B : memory[inst.B]) * (inst.is_KC ? inst.const_C : memory[inst.C]); break;
                //-- OP_DIV
                case 14: memory[inst.A] = (inst.is_KB ? inst.const_B : memory[inst.B]) / (inst.is_KC ? inst.const_C : memory[inst.C]); break;
                //-- OP_MOD
                case 15: memory[inst.A] = (inst.is_KB ? inst.const_B : memory[inst.B]) % (inst.is_KC ? inst.const_C : memory[inst.C]); break;
                //-- OP_POW
                case 16: memory[inst.A] = Math.pow((inst.is_KB ? inst.const_B : memory[inst.B]), (inst.is_KC ? inst.const_C : memory[inst.C])); break;
                //-- OP_UNM
                case 17: memory[inst.A] = -memory[inst.B]; break;
                //-- OP_NOT
                case 18: memory[inst.A] = !memory[inst.B]; break;
                //-- OP_LEN
                case 19: const val_len = memory[inst.B]; memory[inst.A] = typeof val_len === 'string' ? val_len.length : Object.keys(val_len).length; break;
                //-- OP_CONCAT
                case 20: {
                    let str = "";
                    for(let i = inst.B; i <= inst.C; i++) str += memory[i];
                    memory[inst.A] = str;
                    break;
                }
                //-- OP_JMP
                case 21: pc += inst.sBx; break;
                //-- OP_EQ
                case 22: if (((inst.is_KB ? inst.const_B : memory[inst.B]) === (inst.is_KC ? inst.const_C : memory[inst.C])) !== (inst.A === 0)) pc += code[pc].sBx; pc++; break;
                //-- OP_LT
                case 23: if (((inst.is_KB ? inst.const_B : memory[inst.B]) < (inst.is_KC ? inst.const_C : memory[inst.C])) !== (inst.A === 0)) pc += code[pc].sBx; pc++; break;
                //-- OP_LE
                case 24: if (((inst.is_KB ? inst.const_B : memory[inst.B]) <= (inst.is_KC ? inst.const_C : memory[inst.C])) !== (inst.A === 0)) pc += code[pc].sBx; pc++; break;
                //-- OP_TEST
                case 25: if (!!memory[inst.A] !== (inst.C === 0)) pc += code[pc].sBx; pc++; break;
                //-- OP_TESTSET
                case 26: if (!!memory[inst.B] !== (inst.C === 0)) { memory[inst.A] = memory[inst.B]; pc += code[pc].sBx; } pc++; break;
                //-- OP_CALL
                case 27: {
                    const A = inst.A, B = inst.B, C = inst.C;
                    let params_count = (B === 0) ? top_index - A : B - 1;
                    const args_to_pass = table.unpack(memory, A + 1, A + params_count);
                    
                    const func = memory[A];
                    if (typeof func !== 'function') throw new Error("Attempt to call a non-function value.");

                    const ret_list = [].concat(func(...args_to_pass)); // Ensure result is an array
                    const ret_num = ret_list.length;
                    
                    if (C !== 0) {
                        for (let i = 0; i < C - 1; i++) {
                            memory[A + i] = ret_list[i];
                        }
                    } else {
                        top_index = A + ret_num - 1;
                         for (let i = 0; i < ret_num; i++) {
                            memory[A + i] = ret_list[i];
                        }
                    }
                    break;
                }
                //-- OP_TAILCALL
                case 28: {
                    const A = inst.A, B = inst.B;
                    let params_count = (B === 0) ? top_index - A : B - 1;
                    const args_to_pass = table.unpack(memory, A + 1, A + params_count);
                    close_lua_upvalues(open_list, 0);
                    return memory[A](...args_to_pass);
                }
                //-- OP_RETURN
                case 29: {
                    const A = inst.A, B = inst.B;
                    let len = (B === 0) ? top_index - A + 1 : B - 1;
                    close_lua_upvalues(open_list, 0);
                    return table.unpack(memory, A, A + len - 1);
                }
                //-- OP_FORLOOP
                case 30: {
                    const A = inst.A;
                    const step = memory[A + 2];
                    const index = memory[A] + step;
                    const limit = memory[A + 1];
                    const loops = (step >= 0) ? (index <= limit) : (index >= limit);
                    if (loops) {
                        memory[A] = index;
                        memory[A + 3] = index;
                        pc += inst.sBx;
                    }
                    break;
                }
                //-- OP_FORPREP
                case 31: {
                    const A = inst.A;
                    const init = Number(memory[A]);
                    if (isNaN(init)) throw new Error("`for` initial value must be a number");
                    const limit = Number(memory[A+1]);
                    if (isNaN(limit)) throw new Error("`for` limit must be a number");
                    const step = Number(memory[A+2]);
                    if (isNaN(step)) throw new Error("`for` step must be a number");
                    
                    memory[A] = init - step;
                    memory[A+1] = limit;
                    memory[A+2] = step;
                    pc += inst.sBx;
                    break;
                }
                //-- OP_TFORLOOP
                case 32: {
                    const A = inst.A, C = inst.C;
                    const base = A + 3;
                    // In JS, we call the iterator and expect an array of results
                    const vals = [].concat(memory[A](memory[A + 1], memory[A + 2]));
                    
                    table.move(vals, 1-1, C-1, base, memory);

                    if (memory[base] != null) {
                        memory[A + 2] = memory[base];
                        pc += code[pc].sBx;
                    }
                    pc++;
                    break;
                }
                //-- OP_SETLIST
                case 33: {
                    const A = inst.A, B = inst.B, C = inst.C;
                    let len = B;
                    if (len === 0) len = top_index - A;
                    
                    let effective_C = C;
                    if (effective_C === 0) {
                        effective_C = code[pc].value;
                        pc++;
                    }

                    const tab = memory[A];
                    const offset = (effective_C - 1) * FIELDS_PER_FLUSH;
                    
                    table.move(memory, A + 1, A + len, offset + 1, tab);
                    break;
                }
                //-- OP_CLOSE
                case 34: close_lua_upvalues(open_list, inst.A); break;
                //-- OP_CLOSURE
                case 35: {
                    const sub = subs[inst.Bx + 1];
                    const nups = sub.num_upval;
                    let uvlist = null;

                    if (nups !== 0) {
                        uvlist = [null]; // 1-indexed
                        for (let i = 1; i <= nups; i++) {
                            const pseudo = code[pc + i - 1];
                            if (OPCODE_RM[bit.band(pseudo.value, 0x3f)] === 0) { // MOVE
                                uvlist[i] = open_lua_upvalue(open_list, pseudo.B, memory);
                            } else { // GETUPVAL
                                uvlist[i] = upvals[pseudo.B];
                            }
                        }
                        pc += nups;
                    }
                    memory[inst.A] = lua_wrap_state(sub, env, uvlist);
                    break;
                }
                //-- OP_VARARG
                case 36: {
                    const A = inst.A, B = inst.B;
                    let len = B - 1;
                    if (B === 0) {
                        len = vararg.len;
                        top_index = A + len - 1;
                    }
                    table.move(vararg.list, 1, len, A, memory);
                    break;
                }
                default:
                    throw new Error(`Unsupported opcode: ${op}`);
            }
        }
    }

    /**
     * Wraps a function prototype to make it executable.
     * @param {object} proto - The function prototype from deserialization.
     * @param {object} env - The JavaScript environment object.
     * @param {array} upval - The list of upvalues for this closure.
     * @returns {function} An executable JavaScript function.
     */
    function lua_wrap_state(proto, env, upval) {
        return function(...args) {
            const memory = new Array(proto.max_stack + 1).fill(null);
            const vararg = { len: 0, list: [null] };

            // Copy parameters into memory
            for(let i=0; i<proto.num_param; i++) {
                memory[i] = args[i];
            }

            // Handle varargs
            if (proto.num_param < args.length) {
                vararg.len = args.length - proto.num_param;
                for(let i=0; i<vararg.len; i++) {
                     vararg.list[i+1] = args[proto.num_param + i];
                }
            }
            
            const state = {
                vararg, memory,
                code: proto.code,
                subs: proto.subs,
                pc: 1,
            };

            try {
                const result = run_lua_func(state, env, upval);
                // Lua can return multiple values, JS returns one. We return an array.
                // If a single value is returned, we just return that value for convenience.
                if (Array.isArray(result) && result.length <= 1) {
                    return result[0];
                }
                return result;
            } catch (err) {
                const failed = { pc: state.pc, source: proto.source, lines: proto.lines };
                on_lua_error(failed, err);
            }
        };
    }
    
    // Public API
    return {
        /**
         * Deserializes a bytecode string into an executable function.
         * @param {string} bytecode - The raw Lua 5.1 bytecode string.
         * @param {object} [env={}] - A JavaScript object to use as the global environment.
         * @returns {function} An executable JavaScript function.
         */
        load: function(bytecode, env = {}) {
            const main_proto = lua_bc_to_state(bytecode);
            return lua_wrap_state(main_proto, env, [null]); // Top-level has no upvalues
        },
    };
}

// Example Usage:
// const myLuaVM = createLuaVM();
// const env = {
//   print: (...args) => console.log(...args),
//   myJSObject: { value: 42 },
//   myJSFunction: (a, b) => a + b,
// };
// const luaFunc = myLuaVM.load(bytecode, env);
// const result = luaFunc(10, 20); // Call the main Lua chunk with arguments
// console.log("Lua script returned:", result);
