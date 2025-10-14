const luaZ = {};
const luaY = {};
const luaX = {};
const luaP = {};
const luaU = {};
const luaK = {};
const size_size_t = 8;
const lua_assert = (test, message = 'assertion failed!') => {
    if (!test) {
        throw new Error(message);
    }
};
luaZ.make_getS = (self, buff) => {
    let b = buff;
    return () => {
        if (b === null) {
            return null;
        }
        const data = b;
        b = null;
        return data;
    };
};
luaZ.make_getF = (self, source) => {
    const LUAL_BUFFERSIZE = 512;
    let pos = 0;
    return () => {
        if (pos >= source.length) {
            return null;
        }
        const buff = source.substring(pos, pos + LUAL_BUFFERSIZE);
        pos += LUAL_BUFFERSIZE;
        return buff;
    };
};
luaZ.init = (self, reader, data) => {
    if (!reader) {
        return null;
    }
    const z = {
        reader: reader,
        data: data || '',
        n: 0,
        p: 0,
    };
    if (z.data) {
        z.n = z.data.length;
    }
    return z;
};
luaZ.fill = (self, z) => {
    const buff = z.reader();
    if (!buff || buff === '') {
        return 'EOZ';
    }
    z.data = buff;
    z.n = buff.length;
    z.p = 0;
    if (z.n === 0) return 'EOZ';
    const firstChar = z.data.charAt(z.p);
    z.p++;
    z.n--;
    return firstChar;
};
luaZ.zgetc = (self, z) => {
    if (z.n > 0) {
        z.n--;
        return z.data.charAt(z.p++);
    } else {
        return self.fill(self, z);
    }
};
luaX.RESERVED = `
TK_AND and
TK_BREAK break
TK_DO do
TK_ELSE else
TK_ELSEIF elseif
TK_END end
TK_FALSE false
TK_FOR for
TK_FUNCTION function
TK_IF if
TK_IN in
TK_LOCAL local
TK_NIL nil
TK_NOT not
TK_OR or
TK_REPEAT repeat
TK_RETURN return
TK_THEN then
TK_TRUE true
TK_UNTIL until
TK_WHILE while
TK_CONCAT ..
TK_DOTS ...
TK_EQ ==
TK_GE >=
TK_LE <=
TK_NE ~=
TK_NAME <name>
TK_NUMBER <number>
TK_STRING <string>
TK_EOS <eof>
`.trim();
luaX.MAXSRC = 80;
luaX.MAX_INT = 2147483647;
luaX.LUA_QS = "'%s'";
luaX.LUA_COMPAT_LSTR = 1;
luaX.init = function(self) {
    const tokens = {};
    const enums = {};
    const lines = self.RESERVED.split('\n');
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 2) {
            const tok = parts[0];
            const str = parts[1];
            tokens[tok] = str;
            enums[str] = tok;
        }
    }
    self.tokens = tokens;
    self.enums = enums;
};
luaX.chunkid = function(self, source, bufflen) {
    let out;
    if (!source) return '[string]';
    if (source.startsWith('=')) {
        out = source.substring(1, bufflen + 1);
    } else if (source.startsWith('@')) {
        source = source.substring(1);
        let l = source.length;
        out = '';
        if (l > bufflen) {
            out = '...';
            source = source.substring(l - bufflen + 3);
        }
        out += source;
    } else {
        let len = (source.indexOf('\n') + 1 || source.indexOf('\r') + 1 || source.length + 1) - 1;
        bufflen -= 16;
        if (len > bufflen) {
            len = bufflen;
        }
        out = '[string "';
        if (source.length > len) {
            out += source.substring(0, len) + '...';
        } else {
            out += source;
        }
        out += '"]';
    }
    return out;
};
luaX.token2str = function(self, ls, token) {
    if (!token.startsWith('TK_')) {
        if (token >= ' ' && token <= '~') {
            return `'${token}'`;
        } else {
            return `char(${token.charCodeAt(0)})`;
        }
    }
    return self.tokens[token] || '<unknown>';
};
luaX.lexerror = function(self, ls, msg, token) {
    const txtToken = (ls, token) => {
        switch (token) {
            case 'TK_NAME':
            case 'TK_STRING':
            case 'TK_NUMBER':
                return ls.buff;
            default:
                return self.token2str(self, ls, token);
        }
    };
    let buff = self.chunkid(self, ls.source, self.MAXSRC);
    let errmsg = `${buff}:${ls.linenumber}: ${msg}`;
    if (token) {
        errmsg += ` near ${txtToken(ls, token)}`;
    }
    throw new Error(errmsg);
};
luaX.syntaxerror = function(self, ls, msg) {
    self.lexerror(self, ls, msg, ls.t.token);
};
luaX.currIsNewline = function(self, ls) {
    return ls.current === '\n' || ls.current === '\r';
};
luaX.inclinenumber = function(self, ls) {
    const old = ls.current;
    self.nextc(self, ls);
    if (self.currIsNewline(self, ls) && ls.current !== old) {
        self.nextc(self, ls);
    }
    ls.linenumber++;
    if (ls.linenumber >= self.MAX_INT) {
        self.syntaxerror(self, ls, "chunk has too many lines");
    }
};
luaX.setinput = function(self, L, ls, z, source) {
    ls = ls || {};
    ls.lookahead = ls.lookahead || {};
    ls.t = ls.t || {};
    ls.decpoint = '.';
    ls.L = L;
    ls.lookahead.token = 'TK_EOS';
    ls.z = z;
    ls.fs = null;
    ls.linenumber = 1;
    ls.lastline = 1;
    ls.source = source;
    self.nextc(self, ls);
};
luaX.check_next = function(self, ls, set) {
    if (set.includes(ls.current)) {
        self.save_and_next(self, ls);
        return true;
    }
    return false;
};
luaX.next = function(self, ls) {
    ls.lastline = ls.linenumber;
    if (ls.lookahead.token !== 'TK_EOS') {
        ls.t.seminfo = ls.lookahead.seminfo;
        ls.t.token = ls.lookahead.token;
        ls.lookahead.token = 'TK_EOS';
    } else {
        ls.t.token = self.llex(self, ls, ls.t);
    }
};
luaX.lookahead = function(self, ls) {
    lua_assert(ls.lookahead.token === 'TK_EOS');
    ls.lookahead.token = self.llex(self, ls, ls.lookahead);
};
luaX.nextc = function(self, ls) {
    ls.current = luaZ.zgetc(luaZ, ls.z);
    return ls.current;
};
luaX.save = function(self, ls, c) {
    ls.buff += c;
};
luaX.save_and_next = function(self, ls) {
    self.save(self, ls, ls.current);
    return self.nextc(self, ls);
};
luaX.str2d = function(self, s) {
    if (s.match(/^[ \t\r\n]*$/)) return null;
    if (/^0[xX]/.test(s)) {
        return parseInt(s, 16);
    }
    if (!isFinite(s)) return null;
    const result = parseFloat(s);
    return isNaN(result) ? null : result;
};
luaX.buffreplace = function(self, ls, from, to) {
    ls.buff = ls.buff.replace(new RegExp(from.replace(/./g, '\\$&'), 'g'), to);
};
luaX.trydecpoint = function(self, ls, Token) {
    self.buffreplace(self, ls, '.', ls.decpoint);
    const seminfo = self.str2d(self, ls.buff);
    Token.seminfo = seminfo;
    if (seminfo === null) {
        self.lexerror(self, ls, "malformed number", 'TK_NUMBER');
    }
};
luaX.read_numeral = function(self, ls, Token) {
    do {
        self.save_and_next(self, ls);
    } while (/\d/.test(ls.current) || ls.current === '.');
    if (ls.current === 'e' || ls.current === 'E') {
        self.save_and_next(self, ls);
        if (ls.current === '+' || ls.current === '-') {
            self.save_and_next(self, ls);
        }
    }
    while (/[a-zA-Z0-9_]/.test(ls.current)) {
        self.save_and_next(self, ls);
    }
    self.buffreplace(self, ls, '.', ls.decpoint);
    const seminfo = self.str2d(self, ls.buff);
    Token.seminfo = seminfo;
    if (seminfo === null) {
        self.trydecpoint(self, ls, Token);
    }
};
luaX.skip_sep = function(self, ls) {
    let count = 0;
    const s = ls.current;
    lua_assert(s === '[' || s === ']');
    self.save_and_next(self, ls);
    while (ls.current === '=') {
        self.save_and_next(self, ls);
        count++;
    }
    return (ls.current === s) ? count : (-count) - 1;
};
luaX.read_long_string = function(self, ls, Token, sep) {
    self.save_and_next(self, ls);
    if (self.currIsNewline(self, ls)) {
        self.inclinenumber(self, ls);
    }
    while (true) {
        switch (ls.current) {
            case 'EOZ':
                self.lexerror(self, ls, (Token) ? 'unfinished long string' : 'unfinished long comment', 'TK_EOS');
                return;
            case ']':
                if (self.skip_sep(self, ls) === sep) {
                    self.save_and_next(self, ls);
                    if (Token) {
                        const p = 2 + sep;
                        Token.seminfo = ls.buff.substring(p, ls.buff.length - p);
                    }
                    return;
                }
                break;
            default:
                if (Token) {
                    self.save_and_next(self, ls);
                } else {
                    self.nextc(self, ls);
                }
        }
    }
};
luaX.read_string = function(self, ls, del, Token) {
    self.save_and_next(self, ls);
    let str = "";
    while (ls.current !== del) {
        switch (ls.current) {
            case 'EOZ': self.lexerror(self, ls, 'unfinished string', 'TK_EOS'); return;
            case '\n': case '\r': self.lexerror(self, ls, 'unfinished string', 'TK_STRING'); return;
            case '\\':
                self.nextc(self, ls);
                switch (ls.current) {
                    case 'a': str += '\x07'; break;
                    case 'b': str += '\b'; break;
                    case 'f': str += '\f'; break;
                    case 'n': str += '\n'; break;
                    case 'r': str += '\r'; break;
                    case 't': str += '\t'; break;
                    case 'v': str += '\v'; break;
                    case '\n': case '\r': str += '\n'; self.inclinenumber(self, ls); continue;
                    case 'EOZ': continue;
                    default:
                        if (!/\d/.test(ls.current)) {
                            str += ls.current;
                        } else {
                            let c = 0;
                            let i = 0;
                            do {
                                c = 10 * c + parseInt(ls.current, 10);
                                self.nextc(self, ls);
                                i++;
                            } while (i < 3 && /\d/.test(ls.current));
                            if (c > 255) self.lexerror(self, ls, "escape sequence too large", 'TK_STRING');
                            str += String.fromCharCode(c);
                            continue;
                        }
                }
                self.nextc(self, ls);
                break;
            default:
                str += ls.current;
                self.nextc(self, ls);
        }
    }
    self.save_and_next(self, ls);
    Token.seminfo = str;
};
luaX.llex = function(self, ls, Token) {
    ls.buff = '';
    while (true) {
        switch (ls.current) {
            case '\n': case '\r': self.inclinenumber(self, ls); continue;
            case ' ': case '\f': case '\t': case '\v': self.nextc(self, ls); continue;
            case '-':
                self.nextc(self, ls);
                if (ls.current !== '-') return '-';
                self.nextc(self, ls);
                if (ls.current === '[') {
                    const sep = self.skip_sep(self, ls);
                    ls.buff = '';
                    if (sep >= 0) {
                        self.read_long_string(self, ls, null, sep);
                        ls.buff = '';
                        continue;
                    }
                }
                while (!self.currIsNewline(self, ls) && ls.current !== 'EOZ') self.nextc(self, ls);
                continue;
            case '[':
                const sep = self.skip_sep(self, ls);
                if (sep >= 0) {
                    self.read_long_string(self, ls, Token, sep);
                    return 'TK_STRING';
                } else if (sep === -1) return '[';
                else self.lexerror(self, ls, 'invalid long string delimiter', 'TK_STRING');
                continue;
            case '=': self.nextc(self, ls); if (ls.current !== '=') return '='; else { self.nextc(self, ls); return 'TK_EQ'; }
            case '<': self.nextc(self, ls); if (ls.current !== '=') return '<'; else { self.nextc(self, ls); return 'TK_LE'; }
            case '>': self.nextc(self, ls); if (ls.current !== '=') return '>'; else { self.nextc(self, ls); return 'TK_GE'; }
            case '~': self.nextc(self, ls); if (ls.current !== '=') return '~'; else { self.nextc(self, ls); return 'TK_NE'; }
            case '"': case "'": self.read_string(self, ls, ls.current, Token); return 'TK_STRING';
            case '.':
                self.save_and_next(self, ls);
                if (self.check_next(self, ls, '.')) {
                    if (self.check_next(self, ls, '.')) return 'TK_DOTS';
                    else return 'TK_CONCAT';
                } else if (!/\d/.test(ls.current)) return '.';
                else { self.read_numeral(self, ls, Token); return 'TK_NUMBER'; }
            case 'EOZ': return 'TK_EOS';
            default:
                if (/\s/.test(ls.current)) { self.nextc(self, ls); continue; }
                if (/\d/.test(ls.current)) { self.read_numeral(self, ls, Token); return 'TK_NUMBER'; }
                if (/[a-zA-Z_]/.test(ls.current)) {
                    do { self.save_and_next(self, ls); } while (/[a-zA-Z0-9_]/.test(ls.current));
                    const ts = ls.buff;
                    const tok = self.enums[ts];
                    if (tok) return tok;
                    Token.seminfo = ts;
                    return 'TK_NAME';
                } else {
                    const c = ls.current;
                    self.nextc(self, ls);
                    return c;
                }
        }
    }
};
luaP.OpMode = { iABC: 0, iABx: 1, iAsBx: 2 };
luaP.SIZE_C = 9;
luaP.SIZE_B = 9;
luaP.SIZE_Bx = 18;
luaP.SIZE_A = 8;
luaP.SIZE_OP = 6;
luaP.POS_OP = 0;
luaP.POS_A = 6;
luaP.POS_C = 14;
luaP.POS_B = 23;
luaP.POS_Bx = 14;
luaP.MAXARG_Bx = (1 << 18) - 1;
luaP.MAXARG_sBx = luaP.MAXARG_Bx >> 1;
luaP.MAXARG_A = (1 << 8) - 1;
luaP.MAXARG_B = (1 << 9) - 1;
luaP.MAXARG_C = (1 << 9) - 1;
luaP.OpCode = {};
luaP.ROpCode = {};
luaP.opnames = [];
const opcodesList = ['MOVE', 'LOADK', 'LOADBOOL', 'LOADNIL', 'GETUPVAL', 'GETGLOBAL', 'GETTABLE', 'SETGLOBAL', 'SETUPVAL', 'SETTABLE', 'NEWTABLE', 'SELF', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'POW', 'UNM', 'NOT', 'LEN', 'CONCAT', 'JMP', 'EQ', 'LT', 'LE', 'TEST', 'TESTSET', 'CALL', 'TAILCALL', 'RETURN', 'FORLOOP', 'FORPREP', 'TFORLOOP', 'SETLIST', 'CLOSE', 'CLOSURE', 'VARARG'];
opcodesList.forEach((name, i) => {
    const key = `OP_${name}`;
    luaP.opnames[i] = name;
    luaP.OpCode[key] = i;
    luaP.ROpCode[i] = key;
});
luaP.NUM_OPCODES = opcodesList.length;
luaP.OpArgMask = { OpArgN: 0, OpArgU: 1, OpArgR: 2, OpArgK: 3 };
function opmode(t, a, b, c, m) { return (t << 7) | (a << 6) | (luaP.OpArgMask[b] << 4) | (luaP.OpArgMask[c] << 2) | luaP.OpMode[m]; }
luaP.opmodes = [
    opmode(0, 1, 'OpArgR', 'OpArgN', 'iABC'), opmode(0, 1, 'OpArgK', 'OpArgN', 'iABx'),
    opmode(0, 1, 'OpArgU', 'OpArgU', 'iABC'), opmode(0, 1, 'OpArgR', 'OpArgN', 'iABC'),
    opmode(0, 1, 'OpArgU', 'OpArgN', 'iABC'), opmode(0, 1, 'OpArgK', 'OpArgN', 'iABx'),
    opmode(0, 1, 'OpArgR', 'OpArgK', 'iABC'), opmode(0, 0, 'OpArgK', 'OpArgN', 'iABx'),
    opmode(0, 0, 'OpArgU', 'OpArgN', 'iABC'), opmode(0, 0, 'OpArgK', 'OpArgK', 'iABC'),
    opmode(0, 1, 'OpArgU', 'OpArgU', 'iABC'), opmode(0, 1, 'OpArgR', 'OpArgK', 'iABC'),
    opmode(0, 1, 'OpArgK', 'OpArgK', 'iABC'), opmode(0, 1, 'OpArgK', 'OpArgK', 'iABC'),
    opmode(0, 1, 'OpArgK', 'OpArgK', 'iABC'), opmode(0, 1, 'OpArgK', 'OpArgK', 'iABC'),
    opmode(0, 1, 'OpArgK', 'OpArgK', 'iABC'), opmode(0, 1, 'OpArgK', 'OpArgK', 'iABC'),
    opmode(0, 1, 'OpArgR', 'OpArgN', 'iABC'), opmode(0, 1, 'OpArgR', 'OpArgN', 'iABC'),
    opmode(0, 1, 'OpArgR', 'OpArgN', 'iABC'), opmode(0, 1, 'OpArgR', 'OpArgR', 'iABC'),
    opmode(0, 0, 'OpArgR', 'OpArgN', 'iAsBx'), opmode(1, 0, 'OpArgK', 'OpArgK', 'iABC'),
    opmode(1, 0, 'OpArgK', 'OpArgK', 'iABC'), opmode(1, 0, 'OpArgK', 'OpArgK', 'iABC'),
    opmode(1, 1, 'OpArgR', 'OpArgU', 'iABC'), opmode(1, 1, 'OpArgR', 'OpArgU', 'iABC'),
    opmode(0, 1, 'OpArgU', 'OpArgU', 'iABC'), opmode(0, 1, 'OpArgU', 'OpArgU', 'iABC'),
    opmode(0, 0, 'OpArgU', 'OpArgN', 'iABC'), opmode(0, 1, 'OpArgR', 'OpArgN', 'iAsBx'),
    opmode(0, 1, 'OpArgR', 'OpArgN', 'iAsBx'), opmode(1, 0, 'OpArgN', 'OpArgU', 'iABC'),
    opmode(0, 0, 'OpArgU', 'OpArgU', 'iABC'), opmode(0, 0, 'OpArgN', 'OpArgN', 'iABC'),
    opmode(0, 1, 'OpArgU', 'OpArgN', 'iABx'), opmode(0, 1, 'OpArgU', 'OpArgN', 'iABC')
];
luaP.getOpMode = (self, op) => self.opmodes[op] & 3;
luaP.getBMode = (self, op) => (self.opmodes[op] >> 4) & 3;
luaP.getCMode = (self, op) => (self.opmodes[op] >> 2) & 3;
luaP.testAMode = (self, op) => (self.opmodes[op] & (1 << 6)) !== 0;
luaP.testTMode = (self, op) => (self.opmodes[op] & (1 << 7)) !== 0;
luaP.CREATE_ABC = (self, o, a, b, c) => ({ op: o, A: a, B: b, C: c });
luaP.CREATE_ABx = (self, o, a, bx) => ({ op: o, A: a, Bx: bx });
luaP.GET_OPCODE = (self, i) => i.op;
luaP.SET_OPCODE = (self, i, o) => { i.op = o; };
luaP.GETARG_A = (self, i) => i.A;
luaP.SETARG_A = (self, i, u) => { i.A = u; };
luaP.GETARG_B = (self, i) => i.B;
luaP.SETARG_B = (self, i, b) => { i.B = b; };
luaP.GETARG_C = (self, i) => i.C;
luaP.SETARG_C = (self, i, c) => { i.C = c; };
luaP.GETARG_Bx = (self, i) => i.Bx;
luaP.SETARG_Bx = (self, i, b) => { i.Bx = b; };
luaP.GETARG_sBx = (self, i) => i.Bx - self.MAXARG_sBx;
luaP.SETARG_sBx = (self, i, b) => { i.Bx = b + self.MAXARG_sBx; };
luaP.BITRK = 1 << (luaP.SIZE_B - 1);
luaP.ISK = (self, x) => (x & self.BITRK) !== 0;
luaP.INDEXK = (self, r) => r & ~self.BITRK;
luaP.MAXINDEXRK = luaP.BITRK - 1;
luaP.RKASK = (self, x) => x | self.BITRK;
luaP.NO_REG = luaP.MAXARG_A;
luaP.LFIELDS_PER_FLUSH = 50;
luaU.LUA_SIGNATURE = "\x1bLua";
luaU.LUAC_VERSION = 0x51;
luaU.LUAC_FORMAT = 0;
luaU.LUAC_HEADERSIZE = 12;
luaU.LUA_TNUMBER = 3;
luaU.LUA_TSTRING = 4;
luaU.LUA_TNIL = 0;
luaU.LUA_TBOOLEAN = 1;
luaU.make_setS = function() {
    let data = '';
    const writer = (s, buff) => {
        if (s === null) return 0;
        data += s;
        return 0;
    };
    const buff = { getData: () => data };
    return [writer, buff];
};
luaU.ttype = function(self, o) {
    const t = typeof o.value;
    if (t === 'number') return self.LUA_TNUMBER;
    if (t === 'string') return self.LUA_TSTRING;
    if (t === 'boolean') return self.LUA_TBOOLEAN;
    if (o.value === null) return self.LUA_TNIL;
    throw new Error(`Invalid constant type: ${t}`);
};
function toIEEE754Double(value) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true);
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += String.fromCharCode(view.getUint8(i));
    }
    return result;
}
luaU.from_int = function(self, x) {
    let v = '';
    v += String.fromCharCode(x & 0xFF);
    v += String.fromCharCode((x >> 8) & 0xFF);
    v += String.fromCharCode((x >> 16) & 0xFF);
    v += String.fromCharCode((x >> 24) & 0xFF);
    return v;
};
luaU.DumpBlock = function(self, b, D) { if (D.status === 0) D.status = D.write(b, D.data); };
luaU.DumpChar = function(self, y, D) { self.DumpBlock(self, String.fromCharCode(y), D); };
luaU.DumpInt = function(self, x, D) { self.DumpBlock(self, self.from_int(self, x), D); };
luaU.DumpSizeT = function(self, x, D) { self.DumpBlock(self, self.from_int(self, x), D); if (size_size_t === 8) self.DumpBlock(self, self.from_int(self, 0), D); };
luaU.DumpNumber = function(self, x, D) { self.DumpBlock(self, toIEEE754Double(x), D); };
luaU.DumpString = function(self, s, D) {
    if (s === null || typeof s === 'undefined') {
        self.DumpSizeT(self, 0, D);
    } else {
        const len = s.length + 1;
        self.DumpSizeT(self, len, D);
        self.DumpBlock(self, s + '\0', D);
    }
};
luaU.Instruction = function(op, A, B, C, Bx, opMode) {
    let i = op;
    if (opMode === luaP.OpMode.iABC) {
        i |= (A << luaP.POS_A) | (B << luaP.POS_B) | (C << luaP.POS_C);
    } else {
        i |= (A << luaP.POS_A) | (Bx << luaP.POS_Bx);
    }
    return i;
};
luaU.DumpCode = function(self, f, D) {
    const n = f.code.length;
    self.DumpInt(self, n, D);
    for (let i = 0; i < n; i++) {
        const instr = f.code[i];
        const op = instr.op;
        const opMode = luaP.getOpMode(luaP, op);
        const code = self.Instruction(op, instr.A, instr.B, instr.C, instr.Bx, opMode);
        self.DumpInt(self, code, D);
    }
};
luaU.DumpConstants = function(self, f, D) {
    const n = f.k.length;
    self.DumpInt(self, n, D);
    for (let i = 0; i < n; i++) {
        const o = f.k[i];
        const tt = self.ttype(self, o);
        self.DumpChar(self, tt, D);
        switch (tt) {
            case self.LUA_TBOOLEAN: self.DumpChar(self, o.value ? 1 : 0, D); break;
            case self.LUA_TNUMBER: self.DumpNumber(self, o.value, D); break;
            case self.LUA_TSTRING: self.DumpString(self, o.value, D); break;
            case self.LUA_TNIL: break;
        }
    }
    const np = f.p.length;
    self.DumpInt(self, np, D);
    for (let i = 0; i < np; i++) {
        self.DumpFunction(self, f.p[i], f.source, D);
    }
};
luaU.DumpDebug = function(self, f, D) {
    let n;
    n = D.strip ? 0 : f.lineinfo.length;
    self.DumpInt(self, n, D);
    for (let i = 0; i < n; i++) self.DumpInt(self, f.lineinfo[i], D);
    n = D.strip ? 0 : f.locvars.length;
    self.DumpInt(self, n, D);
    for (let i = 0; i < n; i++) {
        self.DumpString(self, f.locvars[i].varname, D);
        self.DumpInt(self, f.locvars[i].startpc, D);
        self.DumpInt(self, f.locvars[i].endpc, D);
    }
    n = D.strip ? 0 : f.upvalues.length;
    self.DumpInt(self, n, D);
    for (let i = 0; i < n; i++) self.DumpString(self, f.upvalues[i], D);
};
luaU.DumpFunction = function(self, f, p, D) {
    let source = f.source;
    if (source === p || D.strip) source = null;
    self.DumpString(self, source, D);
    self.DumpInt(self, f.lineDefined, D);
    self.DumpInt(self, f.lastlinedefined, D);
    self.DumpChar(self, f.nups, D);
    self.DumpChar(self, f.numparams, D);
    self.DumpChar(self, f.is_vararg, D);
    self.DumpChar(self, f.maxstacksize, D);
    self.DumpCode(self, f, D);
    self.DumpConstants(self, f, D);
    self.DumpDebug(self, f, D);
};
luaU.header = function(self) {
    return self.LUA_SIGNATURE + String.fromCharCode(self.LUAC_VERSION, self.LUAC_FORMAT, 1, 4, size_size_t, 4, 8, 0);
};
luaU.DumpHeader = function(self, D) { self.DumpBlock(self, self.header(self), D); };
luaU.dump = function(self, L, f, w, data, strip) {
    const D = { L, write: w, data, strip, status: 0 };
    self.DumpHeader(self, D);
    self.DumpFunction(self, f, null, D);
    D.write(null, D.data);
    return D.status;
};
luaK.MAXSTACK = 250;
luaK.NO_JUMP = -1;
luaK.BinOpr = { OPR_ADD: 0, OPR_SUB: 1, OPR_MUL: 2, OPR_DIV: 3, OPR_MOD: 4, OPR_POW: 5, OPR_CONCAT: 6, OPR_NE: 7, OPR_EQ: 8, OPR_LT: 9, OPR_LE: 10, OPR_GT: 11, OPR_GE: 12, OPR_AND: 13, OPR_OR: 14, OPR_NOBINOPR: 15 };
luaK.UnOpr = { OPR_MINUS: 0, OPR_NOT: 1, OPR_LEN: 2, OPR_NOUNOPR: 3 };
luaK.getcode = (self, fs, e) => fs.f.code[e.info];
luaK.codeAsBx = (self, fs, o, A, sBx) => self.codeABx(self, fs, o, A, sBx + luaP.MAXARG_sBx);
luaK.setmultret = (self, fs, e) => self.setreturns(self, fs, e, luaY.LUA_MULTRET);
luaK.hasjumps = (e) => e.t !== e.f;
luaK.isnumeral = (self, e) => (e.k === 'VKNUM' && e.t === self.NO_JUMP && e.f === self.NO_JUMP);
luaK._nil = function(self, fs, from, n) {
    if (fs.pc > fs.lasttarget) {
        if (fs.pc > 0) {
            const previous = fs.f.code[fs.pc - 1];
            if (luaP.GET_OPCODE(luaP, previous) === luaP.OpCode.OP_LOADNIL) {
                const pfrom = luaP.GETARG_A(luaP, previous);
                const pto = luaP.GETARG_B(luaP, previous);
                if (pfrom <= from && from <= pto + 1) {
                    if (from + n - 1 > pto) luaP.SETARG_B(luaP, previous, from + n - 1);
                    return;
                }
            }
        }
    }
    self.codeABC(self, fs, 'OP_LOADNIL', from, from + n - 1, 0);
};
luaK.jump = function(self, fs) {
    let jpc = fs.jpc;
    fs.jpc = self.NO_JUMP;
    let j = self.codeAsBx(self, fs, 'OP_JMP', 0, self.NO_JUMP);
    j = self.concat(self, fs, j, jpc);
    return j;
};
luaK.ret = function(self, fs, first, nret) { self.codeABC(self, fs, 'OP_RETURN', first, nret + 1, 0); };
luaK.condjump = function(self, fs, op, A, B, C) {
    self.codeABC(self, fs, op, A, B, C);
    return self.jump(self, fs);
};
luaK.fixjump = function(self, fs, pc, dest) {
    const jmp = fs.f.code[pc];
    const offset = dest - (pc + 1);
    lua_assert(dest !== self.NO_JUMP);
    if (Math.abs(offset) > luaP.MAXARG_sBx) luaX.syntaxerror(luaX, fs.ls, "control structure too long");
    luaP.SETARG_sBx(luaP, jmp, offset);
};
luaK.getlabel = function(self, fs) {
    fs.lasttarget = fs.pc;
    return fs.pc;
};
luaK.getjump = function(self, fs, pc) {
    const offset = luaP.GETARG_sBx(luaP, fs.f.code[pc]);
    return (offset === self.NO_JUMP) ? self.NO_JUMP : (pc + 1) + offset;
};
luaK.getjumpcontrol = function(self, fs, pc) {
    const pi = fs.f.code[pc];
    const ppi = fs.f.code[pc - 1];
    if (pc >= 1 && luaP.testTMode(luaP, luaP.GET_OPCODE(luaP, ppi))) return ppi;
    return pi;
};
luaK.need_value = function(self, fs, list) {
    while (list !== self.NO_JUMP) {
        if (luaP.GET_OPCODE(luaP, self.getjumpcontrol(self, fs, list)) !== luaP.OpCode.OP_TESTSET) return true;
        list = self.getjump(self, fs, list);
    }
    return false;
};
luaK.patchtestreg = function(self, fs, node, reg) {
    const i = self.getjumpcontrol(self, fs, node);
    if (luaP.GET_OPCODE(luaP, i) !== luaP.OpCode.OP_TESTSET) return false;
    if (reg !== luaP.NO_REG && reg !== luaP.GETARG_B(luaP, i)) {
        luaP.SETARG_A(luaP, i, reg);
    } else {
        i.op = luaP.OpCode.OP_TEST;
        i.A = luaP.GETARG_B(luaP, i);
        i.B = i.C = 0;
    }
    return true;
};
luaK.removevalues = function(self, fs, list) {
    for (; list !== self.NO_JUMP; list = self.getjump(self, fs, list)) {
        self.patchtestreg(self, fs, list, luaP.NO_REG);
    }
};
luaK.patchlistaux = function(self, fs, list, vtarget, reg, dtarget) {
    while (list !== self.NO_JUMP) {
        let next = self.getjump(self, fs, list);
        if (self.patchtestreg(self, fs, list, reg)) self.fixjump(self, fs, list, vtarget);
        else self.fixjump(self, fs, list, dtarget);
        list = next;
    }
};
luaK.dischargejpc = function(self, fs) {
    self.patchlistaux(self, fs, fs.jpc, fs.pc, luaP.NO_REG, fs.pc);
    fs.jpc = self.NO_JUMP;
};
luaK.patchlist = function(self, fs, list, target) {
    if (target === fs.pc) self.patchtohere(self, fs, list);
    else {
        lua_assert(target < fs.pc);
        self.patchlistaux(self, fs, list, target, luaP.NO_REG, target);
    }
};
luaK.patchtohere = function(self, fs, list) {
    self.getlabel(self, fs);
    fs.jpc = self.concat(self, fs, fs.jpc, list);
};
luaK.concat = function(self, fs, l1, l2) {
    if (l2 === self.NO_JUMP) return l1;
    if (l1 === self.NO_JUMP) return l2;
    let list = l1;
    let next;
    while ((next = self.getjump(self, fs, list)) !== self.NO_JUMP) list = next;
    self.fixjump(self, fs, list, l2);
    return l1;
};
luaK.checkstack = function(self, fs, n) {
    const newstack = fs.freereg + n;
    if (newstack > fs.f.maxstacksize) {
        if (newstack >= self.MAXSTACK) luaX.syntaxerror(luaX, fs.ls, "function or expression too complex");
        fs.f.maxstacksize = newstack;
    }
};
luaK.reserveregs = function(self, fs, n) {
    self.checkstack(self, fs, n);
    fs.freereg += n;
};
luaK.freereg = function(self, fs, reg) {
    if (!luaP.ISK(luaP, reg) && reg >= fs.nactvar) {
        fs.freereg--;
        lua_assert(reg === fs.freereg);
    }
};
luaK.freeexp = function(self, fs, e) { if (e.k === 'VNONRELOC') self.freereg(self, fs, e.info); };
luaK.addk = function(self, fs, k, v) {
    const L = fs.L;
    const f = fs.f;
    const key = (typeof k.value === 'object' && k.value !== null) ? '||obj||' + (fs.nk) : k.value;
    let idx = fs.h[key];
    if (typeof idx === 'number') {
        return idx;
    } else {
        const new_idx = fs.nk;
        fs.h[key] = new_idx;
        fs.f.k[fs.nk] = v;
        fs.nk++;
        return new_idx;
    }
};
luaK.stringK = (self, fs, s) => self.addk(self, fs, { value: s }, { value: s });
luaK.numberK = (self, fs, r) => self.addk(self, fs, { value: r }, { value: r });
luaK.boolK = (self, fs, b) => self.addk(self, fs, { value: b }, { value: b });
luaK.nilK = (self, fs) => self.addk(self, fs, { value: null }, { value: null });
luaK.setreturns = function(self, fs, e, nresults) {
    if (e.k === 'VCALL') {
        luaP.SETARG_C(luaP, self.getcode(self, fs, e), nresults + 1);
    } else if (e.k === 'VVARARG') {
        luaP.SETARG_B(luaP, self.getcode(self, fs, e), nresults + 1);
        luaP.SETARG_A(luaP, self.getcode(self, fs, e), fs.freereg);
        self.reserveregs(self, fs, 1);
    }
};
luaK.setoneret = function(self, fs, e) {
    if (e.k === 'VCALL') {
        e.k = 'VNONRELOC';
        e.info = luaP.GETARG_A(luaP, self.getcode(self, fs, e));
    } else if (e.k === 'VVARARG') {
        luaP.SETARG_B(luaP, self.getcode(self, fs, e), 2);
        e.k = 'VRELOCABLE';
    }
};
luaK.dischargevars = function(self, fs, e) {
    switch (e.k) {
        case 'VLOCAL': e.k = 'VNONRELOC'; break;
        case 'VUPVAL': e.info = self.codeABC(self, fs, 'OP_GETUPVAL', 0, e.info, 0); e.k = 'VRELOCABLE'; break;
        case 'VGLOBAL': e.info = self.codeABx(self, fs, 'OP_GETGLOBAL', 0, e.info); e.k = 'VRELOCABLE'; break;
        case 'VINDEXED':
            self.freereg(self, fs, e.aux);
            self.freereg(self, fs, e.info);
            e.info = self.codeABC(self, fs, 'OP_GETTABLE', 0, e.info, e.aux);
            e.k = 'VRELOCABLE';
            break;
        case 'VVARARG': case 'VCALL': self.setoneret(self, fs, e); break;
        default: break;
    }
};
luaK.code_label = function(self, fs, A, b, jump) {
    self.getlabel(self, fs);
    return self.codeABC(self, fs, 'OP_LOADBOOL', A, b, jump);
};
luaK.discharge2reg = function(self, fs, e, reg) {
    self.dischargevars(self, fs, e);
    switch (e.k) {
        case 'VNIL': self._nil(self, fs, reg, 1); break;
        case 'VFALSE': self.codeABC(self, fs, 'OP_LOADBOOL', reg, 0, 0); break;
        case 'VTRUE': self.codeABC(self, fs, 'OP_LOADBOOL', reg, 1, 0); break;
        case 'VK': self.codeABx(self, fs, 'OP_LOADK', reg, e.info); break;
        case 'VKNUM': self.codeABx(self, fs, 'OP_LOADK', reg, self.numberK(self, fs, e.nval)); break;
        case 'VRELOCABLE': luaP.SETARG_A(luaP, self.getcode(self, fs, e), reg); break;
        case 'VNONRELOC': if (reg !== e.info) self.codeABC(self, fs, 'OP_MOVE', reg, e.info, 0); break;
        default: return;
    }
    e.info = reg;
    e.k = 'VNONRELOC';
};
luaK.discharge2anyreg = function(self, fs, e) {
    if (e.k !== 'VNONRELOC') {
        self.reserveregs(self, fs, 1);
        self.discharge2reg(self, fs, e, fs.freereg - 1);
    }
};
luaK.exp2reg = function(self, fs, e, reg) {
    self.discharge2reg(self, fs, e, reg);
    if (e.k === 'VJMP') e.t = self.concat(self, fs, e.t, e.info);
    if (self.hasjumps(e)) {
        let final, p_f = self.NO_JUMP, p_t = self.NO_JUMP;
        if (self.need_value(self, fs, e.t) || self.need_value(self, fs, e.f)) {
            let fj = (e.k === 'VJMP') ? self.NO_JUMP : self.jump(self, fs);
            p_f = self.code_label(self, fs, reg, 0, 1);
            p_t = self.code_label(self, fs, reg, 1, 0);
            self.patchtohere(self, fs, fj);
        }
        final = self.getlabel(self, fs);
        self.patchlistaux(self, fs, e.f, final, reg, p_f);
        self.patchlistaux(self, fs, e.t, final, reg, p_t);
    }
    e.f = e.t = self.NO_JUMP;
    e.info = reg;
    e.k = 'VNONRELOC';
};
luaK.exp2nextreg = function(self, fs, e) {
    self.dischargevars(self, fs, e);
    self.freeexp(self, fs, e);
    self.reserveregs(self, fs, 1);
    self.exp2reg(self, fs, e, fs.freereg - 1);
};
luaK.exp2anyreg = function(self, fs, e) {
    self.dischargevars(self, fs, e);
    if (e.k !== 'VNONRELOC' || self.hasjumps(e)) {
        self.exp2nextreg(self, fs, e);
    }
    return e.info;
};
luaK.exp2val = function(self, fs, e) {
    if (self.hasjumps(e)) self.exp2anyreg(self, fs, e);
    else self.dischargevars(self, fs, e);
};
luaK.exp2RK = function(self, fs, e) {
    self.exp2val(self, fs, e);
    switch (e.k) {
        case 'VKNUM': case 'VTRUE': case 'VFALSE': case 'VNIL':
            if (fs.nk <= luaP.MAXINDEXRK) {
                if (e.k === 'VNIL') e.info = self.nilK(self, fs);
                else if (e.k === 'VKNUM') e.info = self.numberK(self, fs, e.nval);
                else e.info = self.boolK(self, fs, e.k === 'VTRUE');
                e.k = 'VK';
                return luaP.RKASK(luaP, e.info);
            }
            break;
        case 'VK': if (e.info <= luaP.MAXINDEXRK) return luaP.RKASK(luaP, e.info); break;
        default: break;
    }
    return self.exp2anyreg(self, fs, e);
};
luaK.storevar = function(self, fs, variable, ex) {
    switch (variable.k) {
        case 'VLOCAL': self.freeexp(self, fs, ex); self.exp2reg(self, fs, ex, variable.info); return;
        case 'VUPVAL': { const e = self.exp2anyreg(self, fs, ex); self.codeABC(self, fs, 'OP_SETUPVAL', e, variable.info, 0); break; }
        case 'VGLOBAL': { const e = self.exp2anyreg(self, fs, ex); self.codeABx(self, fs, 'OP_SETGLOBAL', e, variable.info); break; }
        case 'VINDEXED': { const e = self.exp2RK(self, fs, ex); self.codeABC(self, fs, 'OP_SETTABLE', variable.info, variable.aux, e); break; }
        default: lua_assert(false);
    }
    self.freeexp(self, fs, ex);
};
luaK._self = function(self, fs, e, key) {
    self.exp2anyreg(self, fs, e);
    const func = fs.freereg;
    self.reserveregs(self, fs, 2);
    self.codeABC(self, fs, 'OP_SELF', func, e.info, self.exp2RK(self, fs, key));
    self.freeexp(self, fs, key);
    e.info = func;
    e.k = 'VNONRELOC';
};
luaK.invertjump = function(self, fs, e) {
    const pc = self.getjumpcontrol(self, fs, e.info);
    const currentA = luaP.GETARG_A(luaP, pc);
    luaP.SETARG_A(luaP, pc, currentA === 0 ? 1 : 0);
};
luaK.jumponcond = function(self, fs, e, cond) {
    if (e.k === 'VRELOCABLE') {
        const ie = self.getcode(self, fs, e);
        if (luaP.GET_OPCODE(luaP, ie) === luaP.OpCode.OP_NOT) {
            fs.pc--;
            return self.condjump(self, fs, 'OP_TEST', luaP.GETARG_B(luaP, ie), 0, cond ? 0 : 1);
        }
    }
    self.discharge2anyreg(self, fs, e);
    self.freeexp(self, fs, e);
    return self.condjump(self, fs, 'OP_TESTSET', luaP.NO_REG, e.info, cond ? 1 : 0);
};
luaK.goiftrue = function(self, fs, e) {
    self.dischargevars(self, fs, e);
    let pc;
    switch (e.k) {
        case 'VK': case 'VKNUM': case 'VTRUE': pc = luaK.NO_JUMP; break;
        case 'VFALSE': pc = luaK.jump(self, fs); break;
        case 'VJMP': self.invertjump(self, fs, e); pc = e.info; break;
        default: pc = self.jumponcond(self, fs, e, false); break;
    }
    e.f = self.concat(self, fs, e.f, pc);
    self.patchtohere(self, fs, e.t);
    e.t = self.NO_JUMP;
};
luaK.goiffalse = function(self, fs, e) {
    self.dischargevars(self, fs, e);
    let pc;
    switch (e.k) {
        case 'VNIL': case 'VFALSE': pc = luaK.NO_JUMP; break;
        case 'VTRUE': pc = luaK.jump(self, fs); break;
        case 'VJMP': pc = e.info; break;
        default: pc = self.jumponcond(self, fs, e, true); break;
    }
    e.t = self.concat(self, fs, e.t, pc);
    self.patchtohere(self, fs, e.f);
    e.f = self.NO_JUMP;
};
luaK.codenot = function(self, fs, e) {
    self.dischargevars(self, fs, e);
    switch (e.k) {
        case 'VNIL': case 'VFALSE': e.k = 'VTRUE'; break;
        case 'VK': case 'VKNUM': case 'VTRUE': e.k = 'VFALSE'; break;
        case 'VJMP': self.invertjump(self, fs, e); break;
        case 'VRELOCABLE': case 'VNONRELOC':
            self.discharge2anyreg(self, fs, e);
            self.freeexp(self, fs, e);
            e.info = self.codeABC(self, fs, 'OP_NOT', 0, e.info, 0);
            e.k = 'VRELOCABLE';
            break;
        default: lua_assert(false);
    }
    [e.f, e.t] = [e.t, e.f];
    self.removevalues(self, fs, e.f);
    self.removevalues(self, fs, e.t);
};
luaK.indexed = (self, fs, t, k) => { t.aux = self.exp2RK(self, fs, k); t.k = 'VINDEXED'; };
luaK.constfolding = function(self, op, e1, e2) {
    if (!self.isnumeral(self, e1) || !self.isnumeral(self, e2)) return false;
    const v1 = e1.nval, v2 = e2.nval;
    let r;
    switch (op) {
        case 'OP_ADD': r = v1 + v2; break;
        case 'OP_SUB': r = v1 - v2; break;
        case 'OP_MUL': r = v1 * v2; break;
        case 'OP_DIV': if (v2 === 0) return false; r = v1 / v2; break;
        case 'OP_MOD': if (v2 === 0) return false; r = v1 % v2; break;
        case 'OP_POW': r = Math.pow(v1, v2); break;
        case 'OP_UNM': r = -v1; break;
        default: lua_assert(false);
    }
    if (isNaN(r)) return false;
    e1.nval = r;
    return true;
};
luaK.codearith = function(self, fs, op, e1, e2) {
    if (self.constfolding(self, op, e1, e2)) return;
    const o2 = (op !== 'OP_UNM' && op !== 'OP_LEN') ? self.exp2RK(self, fs, e2) : 0;
    const o1 = self.exp2RK(self, fs, e1);
    self.freeexp(self, fs, e2);
    self.freeexp(self, fs, e1);
    e1.info = self.codeABC(self, fs, op, 0, o1, o2);
    e1.k = 'VRELOCABLE';
};
luaK.codecomp = function(self, fs, op, cond, e1, e2) {
    let o1 = self.exp2RK(self, fs, e1);
    let o2 = self.exp2RK(self, fs, e2);
    self.freeexp(self, fs, e2);
    self.freeexp(self, fs, e1);
    if (cond === 0 && op !== 'OP_EQ') { [o1, o2, cond] = [o2, o1, 1]; }
    e1.info = self.condjump(self, fs, op, cond, o1, o2);
    e1.k = 'VJMP';
};
luaK.prefix = function(self, fs, op, e) {
    const e2 = { k: 'VKNUM', nval: 0, t: self.NO_JUMP, f: self.NO_JUMP };
    switch (op) {
        case 'OPR_MINUS': self.codearith(self, fs, 'OP_UNM', e, e2); break;
        case 'OPR_NOT': self.codenot(self, fs, e); break;
        case 'OPR_LEN': self.exp2anyreg(self, fs, e); self.codearith(self, fs, 'OP_LEN', e, e2); break;
        default: lua_assert(false);
    }
};
luaK.infix = function(self, fs, op, v) {
    switch (op) {
        case 'OPR_AND': self.goiftrue(self, fs, v); break;
        case 'OPR_OR': self.goiffalse(self, fs, v); break;
        case 'OPR_CONCAT': self.exp2nextreg(self, fs, v); break;
        case 'OPR_ADD': case 'OPR_SUB': case 'OPR_MUL': case 'OPR_DIV': case 'OPR_MOD': case 'OPR_POW':
            if (!self.isnumeral(self, v)) self.exp2RK(self, fs, v); break;
        default: self.exp2RK(self, fs, v); break;
    }
};
luaK.arith_op = { OPR_ADD: 'OP_ADD', OPR_SUB: 'OP_SUB', OPR_MUL: 'OP_MUL', OPR_DIV: 'OP_DIV', OPR_MOD: 'OP_MOD', OPR_POW: 'OP_POW' };
luaK.comp_op = { OPR_EQ: 'OP_EQ', OPR_NE: 'OP_EQ', OPR_LT: 'OP_LT', OPR_LE: 'OP_LE', OPR_GT: 'OP_LT', OPR_GE: 'OP_LE' };
luaK.comp_cond = { OPR_EQ: 1, OPR_NE: 0, OPR_LT: 1, OPR_LE: 1, OPR_GT: 0, OPR_GE: 0 };
luaK.posfix = function(self, fs, op, e1, e2) {
    const copyexp = (e1, e2) => { Object.assign(e1, e2); };
    switch (op) {
        case 'OPR_AND':
            lua_assert(e1.t === self.NO_JUMP); self.dischargevars(self, fs, e2); e2.f = self.concat(self, fs, e2.f, e1.f); copyexp(e1, e2); break;
        case 'OPR_OR':
            lua_assert(e1.f === self.NO_JUMP); self.dischargevars(self, fs, e2); e2.t = self.concat(self, fs, e2.t, e1.t); copyexp(e1, e2); break;
        case 'OPR_CONCAT':
            self.exp2val(self, fs, e2);
            self.exp2nextreg(self, fs, e2); self.codearith(self, fs, 'OP_CONCAT', e1, e2); break;
        default:
            const arith = self.arith_op[op];
            if (arith) { self.codearith(self, fs, arith, e1, e2); }
            else { self.codecomp(self, fs, self.comp_op[op], self.comp_cond[op], e1, e2); }
    }
};
luaK.fixline = function(self, fs, line) { if (fs.pc > 0) fs.f.lineinfo[fs.pc - 1] = line; };
luaK.code = function(self, fs, i, line) {
    const f = fs.f;
    self.dischargejpc(self, fs);
    f.code.push(i);
    f.lineinfo.push(line);
    const pc = fs.pc;
    fs.pc++;
    return pc;
};
luaK.codeABC = function(self, fs, o, a, b, c) {
    const op = luaP.OpCode[o];
    return self.code(self, fs, luaP.CREATE_ABC(luaP, op, a, b, c), fs.ls.lastline);
};
luaK.codeABx = function(self, fs, o, a, bc) {
    const op = luaP.OpCode[o];
    return self.code(self, fs, luaP.CREATE_ABx(luaP, op, a, bc), fs.ls.lastline);
};
luaK.setlist = function(self, fs, base, nelems, tostore) {
    const c = Math.floor((nelems - 1) / luaP.LFIELDS_PER_FLUSH) + 1;
    const b = (tostore === luaY.LUA_MULTRET) ? 0 : tostore;
    lua_assert(tostore !== 0);
    if (c <= luaP.MAXARG_C) {
        self.codeABC(self, fs, 'OP_SETLIST', base, b, c);
    } else {
        self.codeABC(self, fs, 'OP_SETLIST', base, b, 0);
        self.code(self, fs, { op: c, A: 0, B: 0, C: 0 }, fs.ls.lastline);
    }
    fs.freereg = base + 1;
};
luaY.LUAI_MAXVARS = 200;
luaY.LUAI_MAXUPVALUES = 60;
luaY.LUAI_MAXCCALLS = 200;
luaY.VARARG_HASARG = 1;
luaY.VARARG_ISVARARG = 2;
luaY.VARARG_NEEDSARG = 4;
luaY.LUA_MULTRET = -1;
luaY.newproto = function() { return { k: [], p: [], code: [], lineinfo: [], locvars: [], upvalues: [], nups: 0, numparams: 0, is_vararg: 0, maxstacksize: 0, lineDefined: 0, lastlinedefined: 0, source: null }; };
luaY.int2fb = function(x) {
    let e = 0; if (x < 8) return x;
    while (x >= 16) { x = Math.floor((x + 1) / 2); e++; }
    return ((e + 1) << 3) | (x - 8);
};
luaY.hasmultret = (k) => k === 'VCALL' || k === 'VVARARG';
luaY.getlocvar = (fs, i) => fs.f.locvars[fs.actvar[i]];
luaY.checklimit = function(fs, v, l, m) {
    if (v > l) {
        const msg = (fs.f.linedefined === 0) ? `main function has more than ${l} ${m}` : `function at line ${fs.f.linedefined} has more than ${l} ${m}`;
        luaX.lexerror(luaX, fs.ls, msg, 0);
    }
};
luaY.error_expected = function(ls, token) { luaX.syntaxerror(luaX, ls, `${luaX.token2str(luaX, ls, token)} expected`); };
luaY.testnext = function(ls, c) { if (ls.t.token === c) { luaX.next(luaX, ls); return true; } return false; };
luaY.check = function(ls, c) { if (ls.t.token !== c) this.error_expected(ls, c); };
luaY.checknext = function(ls, c) { this.check(ls, c); luaX.next(luaX, ls); };
luaY.check_condition = function(ls, c, msg) { if (!c) luaX.syntaxerror(luaX, ls, msg); };
luaY.check_match = function(ls, what, who, where) {
    if (!this.testnext(ls, what)) {
        if (where === ls.linenumber) this.error_expected(ls, what);
        else luaX.syntaxerror(luaX, ls, `${luaX.token2str(luaX, ls, what)} expected (to close ${luaX.token2str(luaX, ls, who)} at line ${where})`);
    }
};
luaY.str_checkname = function(ls) {
    this.check(ls, 'TK_NAME');
    const ts = ls.t.seminfo;
    luaX.next(luaX, ls);
    return ts;
};
luaY.init_exp = function(e, k, i) { e.f = e.t = luaK.NO_JUMP; e.k = k; e.info = i; };
luaY.codestring = function(ls, e, s) { this.init_exp(e, 'VK', luaK.stringK(luaK, ls.fs, s)); };
luaY.checkname = function(ls, e) { this.codestring(ls, e, this.str_checkname(ls)); };
luaY.registerlocalvar = function(ls, varname) {
    const fs = ls.fs; const f = fs.f;
    const idx = f.locvars.length;
    f.locvars.push({ varname, startpc: -1, endpc: -1 });
    return idx;
};
luaY.new_localvar = function(ls, name, n) {
    const fs = ls.fs;
    this.checklimit(fs, fs.nactvar + n + 1, this.LUAI_MAXVARS, 'local variables');
    fs.actvar[fs.nactvar + n] = this.registerlocalvar(ls, name);
};
luaY.new_localvarliteral = function(ls, name, n) { this.new_localvar(ls, name, n); };
luaY.adjustlocalvars = function(ls, nvars) {
    const fs = ls.fs;
    for (let i = 0; i < nvars; i++) this.getlocvar(fs, fs.nactvar + i).startpc = fs.pc;
    fs.nactvar += nvars;
};
luaY.removevars = function(ls, tolevel) {
    const fs = ls.fs;
    while (fs.nactvar > tolevel) {
        fs.nactvar--;
        this.getlocvar(fs, fs.nactvar).endpc = fs.pc;
    }
};
luaY.indexupvalue = function(fs, name, v) {
    const f = fs.f;
    for (let i = 0; i < f.nups; i++) {
        if (fs.upvalues[i].k === v.k && fs.upvalues[i].info === v.info) return i;
    }
    this.checklimit(fs, f.nups + 1, this.LUAI_MAXUPVALUES, 'upvalues');
    f.upvalues[f.nups] = name.value;
    fs.upvalues[f.nups] = { k: v.k, info: v.info };
    return f.nups++;
};
luaY.searchvar = function(fs, n) {
    for (let i = fs.nactvar - 1; i >= 0; i--) if (n === this.getlocvar(fs, i).varname) return i;
    return -1;
};
luaY.markupval = function(fs, level) {
    let bl = fs.bl;
    while (bl && bl.nactvar > level) bl = bl.previous;
    if (bl) bl.upval = true;
};
luaY.singlevaraux = function(fs, n, variable, base) {
    if (fs === null) {
        this.init_exp(variable, 'VGLOBAL', luaP.NO_REG);
        return 'VGLOBAL';
    }
    const v = this.searchvar(fs, n);
    if (v >= 0) {
        this.init_exp(variable, 'VLOCAL', v);
        if (!base) this.markupval(fs, v);
        return 'VLOCAL';
    } else {
        if (this.singlevaraux(fs.prev, n, variable, 0) === 'VGLOBAL') return 'VGLOBAL';
        variable.info = this.indexupvalue(fs, n, variable);
        variable.k = 'VUPVAL';
        return 'VUPVAL';
    }
};
luaY.singlevar = function(ls, variable) {
    const varname = this.str_checkname(ls);
    const fs = ls.fs;
    if (this.singlevaraux(fs, { value: varname }, variable, 1) === 'VGLOBAL') {
        variable.info = luaK.stringK(luaK, fs, varname);
    }
};
luaY.adjust_assign = function(ls, nvars, nexps, e) {
    const fs = ls.fs;
    let extra = nvars - nexps;
    if (this.hasmultret(e.k)) {
        extra++;
        if (extra < 0) extra = 0;
        luaK.setreturns(luaK, fs, e, extra);
        if (extra > 1) luaK.reserveregs(luaK, fs, extra - 1);
    } else {
        if (e.k !== 'VVOID') luaK.exp2nextreg(luaK, fs, e);
        if (extra > 0) {
            const reg = fs.freereg;
            luaK.reserveregs(luaK, fs, extra);
            luaK._nil(luaK, fs, reg, extra);
        }
    }
    if (nexps > nvars) fs.freereg -= (nexps - nvars);
};
luaY.enterlevel = (ls) => { ls.L.nCcalls++; if (ls.L.nCcalls > luaY.LUAI_MAXCCALLS) luaX.lexerror(luaX, ls, 'chunk has too many syntax levels', 0); };
luaY.leavelevel = (ls) => { ls.L.nCcalls--; };
luaY.enterblock = function(fs, bl, isbreakable) {
    bl.breaklist = luaK.NO_JUMP;
    bl.isbreakable = isbreakable;
    bl.nactvar = fs.nactvar;
    bl.upval = false;
    bl.previous = fs.bl;
    fs.bl = bl;
    lua_assert(fs.freereg === fs.nactvar);
};
luaY.leaveblock = function(fs) {
    const bl = fs.bl;
    fs.bl = bl.previous;
    this.removevars(fs.ls, bl.nactvar);
    if (bl.upval) luaK.codeABC(luaK, fs, 'OP_CLOSE', bl.nactvar, 0, 0);
    fs.freereg = fs.nactvar;
    luaK.patchtohere(luaK, fs, bl.breaklist);
};
luaY.pushclosure = function(ls, func, v) {
    const fs = ls.fs; const f = fs.f;
    const proto_idx = f.p.length;
    f.p.push(func.f);
    this.init_exp(v, 'VRELOCABLE', luaK.codeABx(luaK, fs, 'OP_CLOSURE', 0, proto_idx));
    for (let i = 0; i < func.f.nups; i++) {
        const o = (func.upvalues[i].k === 'VLOCAL') ? 'OP_MOVE' : 'OP_GETUPVAL';
        luaK.codeABC(luaK, fs, o, 0, func.upvalues[i].info, 0);
    }
};
luaY.open_func = function(ls, fs) {
    const f = this.newproto();
    fs.f = f; fs.prev = ls.fs; fs.ls = ls; fs.L = ls.L; ls.fs = fs;
    fs.pc = 0; fs.lasttarget = -1; fs.jpc = luaK.NO_JUMP; fs.freereg = 0;
    fs.nk = 0; fs.np = 0; fs.nlocvars = 0; fs.nactvar = 0; fs.bl = null;
    f.source = ls.source; f.maxstacksize = 2; fs.h = {}; fs.actvar = []; fs.upvalues = [];
};
luaY.close_func = function(ls) {
    const fs = ls.fs;
    this.removevars(ls, 0);
    luaK.ret(luaK, fs, 0, 0);
    ls.fs = fs.prev;
};
luaY.parser = function(L, z, buff, name) {
    const lexstate = { t: {}, lookahead: { token: 'TK_EOS' }, buff };
    const funcstate = {};
    L.nCcalls = 0;
    luaX.setinput(luaX, L, lexstate, z, name);
    this.open_func(lexstate, funcstate);
    funcstate.f.is_vararg = this.VARARG_ISVARARG;
    luaX.next(luaX, lexstate);
    this.chunk(lexstate);
    this.check(lexstate, 'TK_EOS');
    this.close_func(lexstate);
    return funcstate.f;
};
luaY.field = function(ls, v) {
    const fs = ls.fs; const key = {};
    luaK.exp2anyreg(luaK, fs, v);
    luaX.next(luaX, ls);
    this.checkname(ls, key);
    luaK.indexed(luaK, fs, v, key);
};
luaY.yindex = function(ls, v) { luaX.next(luaX, ls); this.expr(ls, v); luaK.exp2val(luaK, ls.fs, v); this.checknext(ls, ']'); };
luaY.recfield = function(ls, cc) {
    const fs = ls.fs; const reg = fs.freereg;
    const key = {}, val = {};
    if (ls.t.token === 'TK_NAME') { this.checkname(ls, key); } else { this.yindex(ls, key); }
    cc.nh++;
    this.checknext(ls, '=');
    const rkkey = luaK.exp2RK(luaK, fs, key);
    this.expr(ls, val);
    const rkval = luaK.exp2RK(luaK, fs, val);
    luaK.codeABC(luaK, fs, 'OP_SETTABLE', cc.t.info, rkkey, rkval);
    fs.freereg = reg;
};
luaY.closelistfield = function(fs, cc) {
    if (cc.v.k === 'VVOID') return;
    luaK.exp2nextreg(luaK, fs, cc.v);
    cc.v.k = 'VVOID';
    if (cc.tostore === luaP.LFIELDS_PER_FLUSH) {
        luaK.setlist(luaK, fs, cc.t.info, cc.na, cc.tostore);
        cc.tostore = 0;
    }
};
luaY.lastlistfield = function(fs, cc) {
    if (cc.tostore === 0) return;
    if (this.hasmultret(cc.v.k)) {
        luaK.setmultret(luaK, fs, cc.v);
        luaK.setlist(luaK, fs, cc.t.info, cc.na, this.LUA_MULTRET);
        cc.na--;
    } else {
        if (cc.v.k !== 'VVOID') luaK.exp2nextreg(luaK, fs, cc.v);
        luaK.setlist(luaK, fs, cc.t.info, cc.na, cc.tostore);
    }
};
luaY.listfield = function(ls, cc) { this.expr(ls, cc.v); cc.na++; cc.tostore++; };
luaY.constructor = function(ls, t) {
    const fs = ls.fs; const line = ls.linenumber;
    const pc = luaK.codeABC(luaK, fs, 'OP_NEWTABLE', 0, 0, 0);
    const cc = { v: {}, t: t, na: 0, nh: 0, tostore: 0 };
    this.init_exp(t, 'VRELOCABLE', pc);
    this.init_exp(cc.v, 'VVOID', 0);
    luaK.exp2nextreg(luaK, fs, t);
    this.checknext(ls, '{');
    do {
        if (ls.t.token === '}') break;
        this.closelistfield(fs, cc);
        switch (ls.t.token) {
            case 'TK_NAME':
                luaX.lookahead(luaX, ls);
                if (ls.lookahead.token !== '=') this.listfield(ls, cc); else this.recfield(ls, cc);
                break;
            case '[': this.recfield(ls, cc); break;
            default: this.listfield(ls, cc); break;
        }
    } while (this.testnext(ls, ',') || this.testnext(ls, ';'));
    this.check_match(ls, '}', '{', line);
    this.lastlistfield(fs, cc);
    luaP.SETARG_B(luaP, fs.f.code[pc], this.int2fb(cc.na));
    luaP.SETARG_C(luaP, fs.f.code[pc], this.int2fb(cc.nh));
};
luaY.parlist = function(ls) {
    const fs = ls.fs; const f = fs.f;
    let nparams = 0; f.is_vararg = 0;
    if (ls.t.token !== ')') {
        do {
            switch (ls.t.token) {
                case 'TK_NAME': this.new_localvar(ls, this.str_checkname(ls), nparams++); break;
                case 'TK_DOTS': luaX.next(luaX, ls); f.is_vararg = this.VARARG_ISVARARG | this.VARARG_NEEDSARG; break;
                default: luaX.syntaxerror(ls, '<name> or "..." expected');
            }
        } while (f.is_vararg === 0 && this.testnext(ls, ','));
    }
    this.adjustlocalvars(ls, nparams);
    f.numparams = fs.nactvar;
    luaK.reserveregs(luaK, fs, fs.nactvar);
};
luaY.body = function(ls, e, needself, line) {
    const new_fs = {};
    this.open_func(ls, new_fs);
    new_fs.f.lineDefined = line;
    this.checknext(ls, '(');
    if (needself) { this.new_localvar(ls, 'self', 0); this.adjustlocalvars(ls, 1); }
    this.parlist(ls);
    this.checknext(ls, ')');
    this.chunk(ls);
    new_fs.f.lastlinedefined = ls.linenumber;
    this.check_match(ls, 'TK_END', 'TK_FUNCTION', line);
    this.close_func(ls);
    this.pushclosure(ls, new_fs, e);
};
luaY.explist1 = function(ls, v) {
    let n = 1; this.expr(ls, v);
    while (this.testnext(ls, ',')) { luaK.exp2nextreg(luaK, ls.fs, v); this.expr(ls, v); n++; }
    return n;
};
luaY.funcargs = function(ls, f) {
    const fs = ls.fs; const args = {}; const line = ls.linenumber;
    switch (ls.t.token) {
        case '(':
            luaX.next(luaX, ls);
            if (ls.t.token === ')') { args.k = 'VVOID'; } else { this.explist1(ls, args); luaK.setmultret(luaK, fs, args); }
            this.check_match(ls, ')', '(', line);
            break;
        case '{': this.constructor(ls, args); break;
        case 'TK_STRING': this.codestring(ls, args, ls.t.seminfo); luaX.next(luaX, ls); break;
        default: luaX.syntaxerror(ls, 'function arguments expected'); return;
    }
    lua_assert(f.k === 'VNONRELOC');
    const base = f.info;
    const nparams = this.hasmultret(args.k) ? this.LUA_MULTRET : (fs.freereg - (base + 1));
    this.init_exp(f, 'VCALL', luaK.codeABC(luaK, fs, 'OP_CALL', base, nparams + 1, 2));
    luaK.fixline(luaK, fs, line);
    fs.freereg = base + 1;
};
luaY.prefixexp = function(ls, v) {
    if (ls.t.token === '(') {
        const line = ls.linenumber;
        luaX.next(luaX, ls);
        this.expr(ls, v);
        this.check_match(ls, ')', '(', line);
        luaK.dischargevars(luaK, ls.fs, v);
    } else if (ls.t.token === 'TK_NAME') {
        this.singlevar(ls, v);
    } else {
        luaX.syntaxerror(ls, 'unexpected symbol');
    }
};
luaY.primaryexp = function(ls, v) {
    const fs = ls.fs;
    this.prefixexp(ls, v);
    while (true) {
        switch (ls.t.token) {
            case '.': this.field(ls, v); break;
            case '[': { const key = {}; luaK.exp2anyreg(luaK, fs, v); this.yindex(ls, key); luaK.indexed(luaK, fs, v, key); break; }
            case ':': { const key = {}; luaX.next(luaX, ls); this.checkname(ls, key); luaK._self(luaK, fs, v, key); this.funcargs(ls, v); break; }
            case '(': case 'TK_STRING': case '{': luaK.exp2nextreg(luaK, fs, v); this.funcargs(ls, v); break;
            default: return;
        }
    }
};
luaY.simpleexp = function(ls, v) {
    switch (ls.t.token) {
        case 'TK_NUMBER': this.init_exp(v, 'VKNUM', 0); v.nval = ls.t.seminfo; break;
        case 'TK_STRING': this.codestring(ls, v, ls.t.seminfo); break;
        case 'TK_NIL': this.init_exp(v, 'VNIL', 0); break;
        case 'TK_TRUE': this.init_exp(v, 'VTRUE', 0); break;
        case 'TK_FALSE': this.init_exp(v, 'VFALSE', 0); break;
        case 'TK_DOTS': this.check_condition(ls, ls.fs.f.is_vararg, 'cannot use "..." outside a vararg function'); this.init_exp(v, 'VVARARG', luaK.codeABC(luaK, ls.fs, 'OP_VARARG', 0, 1, 0)); break;
        case '{': this.constructor(ls, v); return;
        case 'TK_FUNCTION': luaX.next(luaX, ls); this.body(ls, v, false, ls.linenumber); return;
        default: this.primaryexp(ls, v); return;
    }
    luaX.next(luaX, ls);
};
luaY.getunopr = op => ({ 'TK_NOT': 'OPR_NOT', '-': 'OPR_MINUS', '#': 'OPR_LEN' }[op] || 'OPR_NOUNOPR');
luaY.getbinopr = op => ({ '+': 'OPR_ADD', '-': 'OPR_SUB', '*': 'OPR_MUL', '/': 'OPR_DIV', '%': 'OPR_MOD', '^': 'OPR_POW', '..': 'OPR_CONCAT', 'TK_NE': 'OPR_NE', 'TK_EQ': 'OPR_EQ', '<': 'OPR_LT', 'TK_LE': 'OPR_LE', '>': 'OPR_GT', 'TK_GE': 'OPR_GE', 'TK_AND': 'OPR_AND', 'TK_OR': 'OPR_OR' }[ls.t.token] || 'OPR_NOBINOPR');
luaY.priority = { OPR_ADD: { left: 6, right: 6 }, OPR_SUB: { left: 6, right: 6 }, OPR_MUL: { left: 7, right: 7 }, OPR_DIV: { left: 7, right: 7 }, OPR_MOD: { left: 7, right: 7 }, OPR_POW: { left: 10, right: 9 }, OPR_CONCAT: { left: 5, right: 4 }, OPR_NE: { left: 3, right: 3 }, OPR_EQ: { left: 3, right: 3 }, OPR_LT: { left: 3, right: 3 }, OPR_LE: { left: 3, right: 3 }, OPR_GT: { left: 3, right: 3 }, OPR_GE: { left: 3, right: 3 }, OPR_AND: { left: 2, right: 2 }, OPR_OR: { left: 1, right: 1 } };
luaY.UNARY_PRIORITY = 8;
luaY.subexpr = function(ls, v, limit) {
    this.enterlevel(ls);
    let uop = this.getunopr(ls.t.token);
    if (uop !== 'OPR_NOUNOPR') {
        luaX.next(luaX, ls); this.subexpr(ls, v, this.UNARY_PRIORITY); luaK.prefix(luaK, ls.fs, uop, v);
    } else this.simpleexp(ls, v);
    let op = this.getbinopr(ls.t.token);
    while (op !== 'OPR_NOBINOPR' && this.priority[op].left > limit) {
        const v2 = {};
        luaX.next(luaX, ls);
        luaK.infix(luaK, ls.fs, op, v);
        const nextop = this.subexpr(ls, v2, this.priority[op].right);
        luaK.posfix(luaK, ls.fs, op, v, v2);
        op = nextop;
    }
    this.leavelevel(ls); return op;
};
luaY.expr = function(ls, v) { this.subexpr(ls, v, 0); };
luaY.block_follow = token => ['TK_ELSE', 'TK_ELSEIF', 'TK_END', 'TK_UNTIL', 'TK_EOS'].includes(token);
luaY.block = function(ls) {
    const fs = ls.fs; const bl = {};
    this.enterblock(fs, bl, false); this.chunk(ls); lua_assert(bl.breaklist === luaK.NO_JUMP); this.leaveblock(fs);
};
luaY.check_conflict = function(ls, lh, v) {
    const fs = ls.fs; let extra = fs.freereg; let conflict = false;
    for (; lh; lh = lh.prev) {
        if (lh.v.k === 'VINDEXED') {
            if (lh.v.info === v.info) { conflict = true; lh.v.info = extra; }
            if (lh.v.aux === v.info) { conflict = true; lh.v.aux = extra; }
        }
    }
    if (conflict) { luaK.codeABC(luaK, fs, 'OP_MOVE', fs.freereg, v.info, 0); luaK.reserveregs(luaK, fs, 1); }
};
luaY.assignment = function(ls, lh, nvars) {
    const e = {};
    this.check_condition(ls, ['VLOCAL', 'VUPVAL', 'VGLOBAL', 'VINDEXED'].includes(lh.v.k), "syntax error");
    if (this.testnext(ls, ',')) {
        const nv = { v: {}, prev: lh };
        this.primaryexp(ls, nv.v);
        if (nv.v.k === 'VLOCAL') this.check_conflict(ls, lh, nv.v);
        this.assignment(ls, nv, nvars + 1);
    } else {
        this.checknext(ls, '=');
        const nexps = this.explist1(ls, e);
        if (nexps !== nvars) {
            this.adjust_assign(ls, nvars, nexps, e);
        } else {
            luaK.setoneret(luaK, ls.fs, e);
            luaK.storevar(luaK, ls.fs, lh.v, e);
            return;
        }
    }
    this.init_exp(e, 'VNONRELOC', ls.fs.freereg - 1);
    luaK.storevar(luaK, ls.fs, lh.v, e);
};
luaY.cond = function(ls) {
    const v = {}; this.expr(ls, v); if (v.k === 'VNIL') v.k = 'VFALSE';
    luaK.goiftrue(luaK, ls.fs, v);
    return v.f;
};
luaY.breakstat = function(ls) {
    const fs = ls.fs; let bl = fs.bl; let upval = false;
    while (bl && !bl.isbreakable) { if (bl.upval) upval = true; bl = bl.previous; }
    if (!bl) luaX.syntaxerror(luaX, ls, 'no loop to break');
    if (upval) luaK.codeABC(luaK, fs, 'OP_CLOSE', bl.nactvar, 0, 0);
    bl.breaklist = luaK.concat(luaK, fs, bl.breaklist, luaK.jump(luaK, fs));
};
luaY.whilestat = function(ls, line) {
    const fs = ls.fs; const bl = {}; luaX.next(luaX, ls);
    const whileinit = luaK.getlabel(luaK, fs);
    const condexit = this.cond(ls);
    this.enterblock(fs, bl, true); this.checknext(ls, 'TK_DO'); this.block(ls);
    luaK.patchlist(luaK, fs, luaK.jump(luaK, fs), whileinit);
    this.check_match(ls, 'TK_END', 'TK_WHILE', line); this.leaveblock(fs);
    luaK.patchtohere(luaK, fs, condexit);
};
luaY.repeatstat = function(ls, line) {
    const fs = ls.fs; const repeat_init = luaK.getlabel(luaK, fs);
    const bl1 = {}, bl2 = {};
    this.enterblock(fs, bl1, true); this.enterblock(fs, bl2, false);
    luaX.next(luaX, ls); this.chunk(ls);
    this.check_match(ls, 'TK_UNTIL', 'TK_REPEAT', line);
    const condexit = this.cond(ls);
    if (!bl2.upval) { this.leaveblock(fs); luaK.patchlist(luaK, ls.fs, condexit, repeat_init); }
    else { this.breakstat(ls); luaK.patchtohere(luaK, ls.fs, condexit); this.leaveblock(fs); luaK.patchlist(luaK, ls.fs, luaK.jump(luaK, fs), repeat_init); }
    this.leaveblock(fs);
};
luaY.exp1 = function(ls) { const e = {}; this.expr(ls, e); luaK.exp2nextreg(luaK, ls.fs, e); return e.k; };
luaY.forbody = function(ls, base, line, nvars, isnum) {
    const bl = {}; const fs = ls.fs;
    this.adjustlocalvars(ls, 3); this.checknext(ls, 'TK_DO');
    const prep = isnum ? luaK.codeAsBx(luaK, fs, 'OP_FORPREP', base, luaK.NO_JUMP) : luaK.jump(luaK, fs);
    this.enterblock(fs, bl, false);
    this.adjustlocalvars(ls, nvars); luaK.reserveregs(luaK, fs, nvars);
    this.block(ls); this.leaveblock(fs);
    luaK.patchtohere(luaK, fs, prep);
    const endfor = isnum ? luaK.codeAsBx(luaK, fs, 'OP_FORLOOP', base, luaK.NO_JUMP) : luaK.codeABC(luaK, fs, 'OP_TFORLOOP', base, 0, nvars);
    luaK.fixline(luaK, fs, line);
    luaK.patchlist(luaK, fs, isnum ? endfor : luaK.jump(luaK, fs), prep + 1);
};
luaY.fornum = function(ls, varname, line) {
    const fs = ls.fs; const base = fs.freereg;
    this.new_localvarliteral(ls, '(for index)', 0); this.new_localvarliteral(ls, '(for limit)', 1); this.new_localvarliteral(ls, '(for step)', 2); this.new_localvar(ls, varname, 3);
    this.checknext(ls, '='); this.exp1(ls); this.checknext(ls, ','); this.exp1(ls);
    if (this.testnext(ls, ',')) this.exp1(ls);
    else { luaK.codeABx(luaK, fs, 'OP_LOADK', fs.freereg, luaK.numberK(luaK, fs, 1)); luaK.reserveregs(luaK, fs, 1); }
    this.forbody(ls, base, line, 1, true);
};
luaY.forlist = function(ls, indexname) {
    const fs = ls.fs; const e = {}; let nvars = 0; const base = fs.freereg;
    this.new_localvarliteral(ls, '(for generator)', nvars++); this.new_localvarliteral(ls, '(for state)', nvars++); this.new_localvarliteral(ls, '(for control)', nvars++);
    this.new_localvar(ls, indexname, nvars++);
    while (this.testnext(ls, ',')) this.new_localvar(ls, this.str_checkname(ls), nvars++);
    this.checknext(ls, 'TK_IN'); const line = ls.linenumber;
    this.adjust_assign(ls, 3, this.explist1(ls, e), e);
    luaK.checkstack(luaK, fs, 3);
    this.forbody(ls, base, line, nvars - 3, false);
};
luaY.forstat = function(ls, line) {
    const fs = ls.fs; const bl = {}; this.enterblock(fs, bl, true);
    luaX.next(luaX, ls); const varname = this.str_checkname(ls);
    if (ls.t.token === '=') this.fornum(ls, varname, line);
    else if (ls.t.token === ',' || ls.t.token === 'TK_IN') this.forlist(ls, varname);
    else luaX.syntaxerror(luaX, ls, `'=' or 'in' expected`);
    this.check_match(ls, 'TK_END', 'TK_FOR', line); this.leaveblock(fs);
};
luaY.test_then_block = function(ls) {
    luaX.next(luaX, ls); const condexit = this.cond(ls);
    this.checknext(ls, 'TK_THEN'); this.block(ls); return condexit;
};
luaY.ifstat = function(ls, line) {
    const fs = ls.fs; let escapelist = luaK.NO_JUMP; let flist = this.test_then_block(ls);
    while (ls.t.token === 'TK_ELSEIF') {
        escapelist = luaK.concat(luaK, fs, escapelist, luaK.jump(luaK, fs));
        luaK.patchtohere(luaK, fs, flist);
        flist = this.test_then_block(ls);
    }
    if (ls.t.token === 'TK_ELSE') {
        escapelist = luaK.concat(luaK, fs, escapelist, luaK.jump(luaK, fs));
        luaK.patchtohere(luaK, fs, flist);
        luaX.next(luaX, ls); this.block(ls);
    } else escapelist = luaK.concat(luaK, fs, escapelist, flist);
    luaK.patchtohere(luaK, fs, escapelist);
    this.check_match(ls, 'TK_END', 'TK_IF', line);
};
luaY.localfunc = function(ls) {
    const v = {}, b = {}; const fs = ls.fs;
    this.new_localvar(ls, this.str_checkname(ls), 0);
    this.adjustlocalvars(ls, 1);
    this.init_exp(v, 'VLOCAL', fs.freereg);
    luaK.reserveregs(luaK, fs, 1);
    this.body(ls, b, false, ls.linenumber);
    luaK.storevar(luaK, fs, v, b);
    this.getlocvar(fs, fs.nactvar - 1).startpc = fs.pc;
};
luaY.localstat = function(ls) {
    let nvars = 0, nexps; const e = {};
    do { this.new_localvar(ls, this.str_checkname(ls), nvars++); } while (this.testnext(ls, ','));
    if (this.testnext(ls, '=')) nexps = this.explist1(ls, e);
    else { e.k = 'VVOID'; nexps = 0; }
    this.adjust_assign(ls, nvars, nexps, e); this.adjustlocalvars(ls, nvars);
};
luaY.funcname = function(ls, v) {
    let needself = false;
    this.singlevar(ls, v);
    while (ls.t.token === '.') this.field(ls, v);
    if (ls.t.token === ':') { needself = true; this.field(ls, v); }
    return needself;
};
luaY.funcstat = function(ls, line) {
    const v = {}, b = {};
    luaX.next(luaX, ls);
    const needself = this.funcname(ls, v);
    this.body(ls, b, needself, line);
    luaK.storevar(luaK, ls.fs, v, b);
    luaK.fixline(luaK, ls.fs, line);
};
luaY.exprstat = function(ls) {
    const fs = ls.fs; const v = { v: {} };
    this.primaryexp(ls, v.v);
    if (v.v.k === 'VCALL') luaP.SETARG_C(luaP, luaK.getcode(luaK, fs, v.v), 1);
    else { v.prev = null; this.assignment(ls, v, 1); }
};
luaY.retstat = function(ls) {
    const fs = ls.fs; luaX.next(luaX, ls); let first, nret;
    if (this.block_follow(ls.t.token) || ls.t.token === ';') first = nret = 0;
    else {
        const e = {}; nret = this.explist1(ls, e);
        if (this.hasmultret(e.k)) {
            luaK.setmultret(luaK, fs, e);
            if (e.k === 'VCALL' && nret === 1) { const code = luaK.getcode(luaK, fs, e); code.op = luaP.OpCode.OP_TAILCALL; }
            first = fs.nactvar; nret = this.LUA_MULTRET;
        } else {
            if (nret === 1) first = luaK.exp2anyreg(luaK, fs, e);
            else { luaK.exp2nextreg(luaK, fs, e); first = fs.nactvar; }
        }
    }
    luaK.ret(luaK, fs, first, nret);
};
luaY.statement = function(ls) {
    const line = ls.linenumber;
    switch (ls.t.token) {
        case 'TK_IF': this.ifstat(ls, line); return false;
        case 'TK_WHILE': this.whilestat(ls, line); return false;
        case 'TK_DO': luaX.next(luaX, ls); this.block(ls); this.check_match(ls, 'TK_END', 'TK_DO', line); return false;
        case 'TK_FOR': this.forstat(ls, line); return false;
        case 'TK_REPEAT': this.repeatstat(ls, line); return false;
        case 'TK_FUNCTION': this.funcstat(ls, line); return false;
        case 'TK_LOCAL': luaX.next(luaX, ls); if (this.testnext(ls, 'TK_FUNCTION')) this.localfunc(ls); else this.localstat(ls); return false;
        case 'TK_RETURN': this.retstat(ls); return true;
        case 'TK_BREAK': luaX.next(luaX, ls); this.breakstat(ls); return true;
        default: this.exprstat(ls); return false;
    }
};
luaY.chunk = function(ls) {
    let islast = false;
    this.enterlevel(ls);
    while (!islast && !this.block_follow(ls.t.token)) {
        islast = this.statement(ls);
        this.testnext(ls, ';');
        ls.fs.freereg = ls.fs.nactvar;
    }
    this.leavelevel(ls);
};
function compileLua(source, name = 'compiled-lua') {
    luaX.init(luaX);
    const LuaState = {};
    const zio = luaZ.init(luaZ, luaZ.make_getF(luaZ, source), null);
    if (!zio) throw new Error("Failed to initialize ZIO stream.");
    const func = luaY.parser(LuaState, zio, null, `@${name}`);
    const [writer, buff] = luaU.make_setS(luaU);
    luaU.dump(luaU, LuaState, func, writer, buff, false);
    return buff.getData();
}
