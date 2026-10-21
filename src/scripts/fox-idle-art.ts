import type { IdleSample } from './fox-idle.ts';

// Continuous, local texture deformation keeps the approved brushwork intact.
// No sprite swaps, duplicated ear edges, or whole-body scaling are involved.
const vertex = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = vec2((position.x + 1.) * .5, (1. - position.y) * .5); gl_Position = vec4(position, 0., 1.); }
`;
const fragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D artwork;
uniform vec4 rect;
uniform float pose, part, blink, breath, nearEar, farEar, tail, head;
float region(vec2 p, vec2 center, vec2 radius) {
	return 1. - smoothstep(.35, 1., length((p - center) / radius));
}
vec2 turn(vec2 p, vec2 pivot, float angle) {
	float c = cos(angle), s = sin(angle); vec2 q = p - pivot;
	return pivot + vec2(c*q.x - s*q.y, s*q.x + c*q.y);
}
vec2 ear(vec2 p, vec2 pivot, vec2 radius, float angle) {
	float w = region(p, pivot - vec2(0., radius.y * .55), radius);
	w *= 1. - smoothstep(pivot.y - .035, pivot.y + .018, p.y);
	return mix(p, turn(p, pivot, -angle), w);
}
vec2 eyelid(vec2 p, vec2 center, vec2 radius) {
	float x = 1. - smoothstep(.75, 1.18, abs(p.x - center.x) / radius.x);
	float openness = 1. - blink * .94 * x;
	float dy = p.y - center.y, d = abs(dy), core = radius.y, outer = core * 2.8;
	if(d < outer) {
		float mapped = d < core * openness ? d / openness :
			core + (d - core * openness) * (outer - core) / (outer - core * openness);
		p.y = center.y + sign(dy) * mapped;
	}
	return p;
}
void main() {
	vec2 p = (uv - rect.xy) / rect.zw;
	if(p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) { gl_FragColor = vec4(0.); return; }
	bool sitting = pose > .5 && pose < 1.5;
	bool sleeping = pose > 1.5;
	if(part < 1.5) {
		float chest = sleeping ? region(p, vec2(.72,.46), vec2(.26,.26)) :
			sitting ? region(p, vec2(.37,.47), vec2(.21,.25)) :
			max(region(p, vec2(.40,.58), vec2(.19,.23)), region(p, vec2(.67,.56), vec2(.23,.18)) * .9);
		p.y += breath * (sleeping ? .008 : .006) * chest;
		p.x += breath * .002 * chest;
		if(!sleeping) {
			vec2 pivot = sitting ? vec2(.72,.88) : vec2(.83,.82);
			float w = sitting ? region(p, vec2(.51,.95), vec2(.20,.14)) :
				region(p, vec2(.64,.88), vec2(.20,.18));
			// Explicit front-paw exclusion, even at the edge of the soft mask.
			w *= smoothstep(sitting ? .43 : .55, sitting ? .48 : .60, p.x);
			p = mix(p, turn(p, pivot, tail * .075), w);
		}
	}
	if(part != 1. && !sleeping) {
		if(!sitting) p = mix(p, turn(p, vec2(.40,.38), -head * .0174533), region(p, vec2(.32,.19), vec2(.28,.28)));
		p = ear(p, sitting ? vec2(.32,.135) : vec2(.313,.17), sitting ? vec2(.075,.15) : vec2(.07,.18), farEar * .0174533);
		p = ear(p, sitting ? vec2(.437,.205) : vec2(.413,.28), sitting ? vec2(.105,.21) : vec2(.10,.25), nearEar * .0174533);
		p = eyelid(p, sitting ? vec2(.297,.187) : vec2(.294,.263), sitting ? vec2(.035,.011) : vec2(.031,.013));
	}
	gl_FragColor = texture2D(artwork, clamp(p, 0., 1.));
}
`;

export class FoxIdleArt {
	readonly pose: string;
	private image: HTMLImageElement;
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext | null = null;
	private program?: WebGLProgram;
	private texture?: WebGLTexture;
	private buffer?: WebGLBuffer;
	private uniforms = new Map<string, WebGLUniformLocation>();
	private failed = false;
	private restored: () => void;
	private lost: (event: Event) => void;
	constructor(private host: HTMLElement) {
		this.pose = host.dataset.idleArt!;
		this.image = host.querySelector('img')!;
		this.canvas = host.querySelector('canvas')!;
		this.lost = event => { event.preventDefault(); this.hide(); this.gl = null; this.failed = true; };
		this.restored = () => { this.failed = false; };
		this.canvas.addEventListener('webglcontextlost', this.lost);
		this.canvas.addEventListener('webglcontextrestored', this.restored);
	}
	private initialize() {
		if (this.failed || !this.image.complete || !this.image.naturalWidth) return false;
		const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
		if (!gl) { this.failed = true; return false; }
		this.gl = gl;
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source); gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Fox artwork shader unavailable'); }
			return shader;
		};
		try {
			const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
			const program = gl.createProgram()!;
			gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
			gl.deleteShader(vs); gl.deleteShader(fs);
			this.program = program;
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Fox artwork program unavailable');
			gl.useProgram(program);
			this.buffer = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
			const position = gl.getAttribLocation(program, 'position');
			gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
			this.texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, this.texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
			for (const name of ['rect', 'pose', 'part', 'blink', 'breath', 'nearEar', 'farEar', 'tail', 'head']) {
				const uniform = gl.getUniformLocation(program, name);
				if (uniform !== null) this.uniforms.set(name, uniform);
			}
			return true;
		} catch { this.failed = true; this.hide(); this.release(); return false; }
	}
	draw(sample: IdleSample, width: number) {
		if (!this.gl && !this.initialize()) return;
		const gl = this.gl!;
		const resolution = Math.max(1, Math.min(640, Math.round(width * Math.min(devicePixelRatio, 2))));
		if (this.canvas.width !== resolution || this.canvas.height !== resolution) {
			this.canvas.width = this.canvas.height = resolution;
			gl.viewport(0, 0, resolution, resolution);
		}
		const height = this.image.naturalHeight / this.image.naturalWidth;
		gl.uniform4f(this.uniforms.get('rect')!, 0, 1 - height, 1, height);
		const values = { ...sample, pose: this.pose === 'sitting' ? 1 : this.pose === 'sleeping' ? 2 : 0,
			part: this.host.dataset.idlePart === 'body' ? 1 : this.host.dataset.idlePart === 'head' ? 2 : 0 };
		for (const [name, value] of Object.entries(values)) if (typeof value === 'number' && this.uniforms.has(name)) gl.uniform1f(this.uniforms.get(name)!, value);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		this.host.dataset.rendered = 'true';
	}
	hide() { delete this.host.dataset.rendered; }
	private release() {
		if (this.gl) {
			if (this.texture) this.gl.deleteTexture(this.texture);
			if (this.buffer) this.gl.deleteBuffer(this.buffer);
			if (this.program) this.gl.deleteProgram(this.program);
		}
		this.gl = null; this.uniforms.clear();
	}
	dispose() {
		this.hide(); this.release();
		this.canvas.removeEventListener('webglcontextlost', this.lost);
		this.canvas.removeEventListener('webglcontextrestored', this.restored);
	}
}
