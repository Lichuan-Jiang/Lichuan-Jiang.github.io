const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

const controls = {
  scaleC: document.getElementById("scaleC"),
  softening: document.getElementById("softening"),
  alpha: document.getElementById("alpha"),
  powerN: document.getElementById("powerN"),
  grid: document.getElementById("grid"),
  gridValue: document.getElementById("gridValue"),
  moment: document.getElementById("moment"),
  momentValue: document.getElementById("momentValue"),
  angle: document.getElementById("angle"),
  angleValue: document.getElementById("angleValue"),
  selectedInfo: document.getElementById("selectedInfo"),
  showStreamlines: document.getElementById("showStreamlines"),
  showVectors: document.getElementById("showVectors")
};

const world = {
  xMin: -4,
  xMax: 4,
  yMin: -2.55,
  yMax: 2.55
};

const defaultDipoles = [
  { x: -1.45, y: 0, m: 1.7, theta: 0 },
  { x: 1.45, y: 0, m: 1.7, theta: Math.PI }
];

let dipoles = defaultDipoles.map(copyDipole);
let selected = 0;
let drag = null;

function copyDipole(d) {
  return { x: d.x, y: d.y, m: d.m, theta: d.theta };
}

function params() {
  return {
    c: readNumber(controls.scaleC, 1),
    a: Math.max(0.02, readNumber(controls.softening, 0.16)),
    alpha: readNumber(controls.alpha, 3),
    n: Math.max(0.5, readNumber(controls.powerN, 3)),
    grid: Number(controls.grid.value)
  };
}

function readNumber(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function worldToScreen(p) {
  const x = (p.x - world.xMin) / (world.xMax - world.xMin) * canvas.width;
  const y = (world.yMax - p.y) / (world.yMax - world.yMin) * canvas.height;
  return { x, y };
}

function screenToWorld(p) {
  const x = world.xMin + p.x / canvas.width * (world.xMax - world.xMin);
  const y = world.yMax - p.y / canvas.height * (world.yMax - world.yMin);
  return { x, y };
}

function fieldAt(x, y) {
  const p = params();
  let bx = 0;
  let by = 0;

  for (const d of dipoles) {
    const rx = x - d.x;
    const ry = y - d.y;
    const mx = d.m * Math.cos(d.theta);
    const my = d.m * Math.sin(d.theta);
    const dot = mx * rx + my * ry;
    const rho2 = rx * rx + ry * ry + p.a * p.a;
    const rhoN = Math.pow(rho2, p.n / 2);
    const rhoNp2 = Math.pow(rho2, (p.n + 2) / 2);
    bx += p.c * (p.alpha * rx * dot / rhoNp2 - mx / rhoN);
    by += p.c * (p.alpha * ry * dot / rhoNp2 - my / rhoN);
  }

  return { x: bx, y: by };
}

function draw() {
  const styles = getComputedStyle(document.documentElement);
  const bg = styles.getPropertyValue("--panel").trim();
  const fg = styles.getPropertyValue("--fg").trim();
  const muted = styles.getPropertyValue("--muted").trim();
  const line = styles.getPropertyValue("--line").trim();
  const accent = styles.getPropertyValue("--accent").trim();
  const accent2 = styles.getPropertyValue("--accent-2").trim();
  const fieldColor = styles.getPropertyValue("--field").trim();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(line);

  if (controls.showStreamlines.checked) drawStreamlines(fieldColor);
  if (controls.showVectors.checked) drawVectors(fieldColor);
  drawDipoles(fg, muted, accent, accent2);
  updatePanel();
}

function drawGrid(color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;

  for (let x = Math.ceil(world.xMin); x <= world.xMax; x++) {
    const p = worldToScreen({ x, y: 0 });
    ctx.beginPath();
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, canvas.height);
    ctx.stroke();
  }

  for (let y = Math.ceil(world.yMin); y <= world.yMax; y++) {
    const p = worldToScreen({ x: 0, y });
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(canvas.width, p.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.8;
  const origin = worldToScreen({ x: 0, y: 0 });
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, canvas.height);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(canvas.width, origin.y);
  ctx.stroke();
  ctx.restore();
}

function drawVectors(color) {
  const step = params().grid;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = 1.5;

  for (let sx = step / 2; sx < canvas.width; sx += step) {
    for (let sy = step / 2; sy < canvas.height; sy += step) {
      const w = screenToWorld({ x: sx, y: sy });
      const b = fieldAt(w.x, w.y);
      const mag = Math.hypot(b.x, b.y);
      if (!Number.isFinite(mag) || mag < 1e-8) continue;
      const len = Math.min(step * 0.44, 7 + Math.log1p(mag) * 6);
      const ux = b.x / mag;
      const uy = -b.y / mag;
      drawArrow(sx - ux * len * 0.5, sy - uy * len * 0.5, sx + ux * len * 0.5, sy + uy * len * 0.5, 5);
    }
  }
  ctx.restore();
}

function drawStreamlines(color) {
  const seeds = [];
  for (const d of dipoles) {
    for (let i = 0; i < 22; i++) {
      const angle = (Math.PI * 2 * i) / 22;
      seeds.push({ x: d.x + Math.cos(angle) * 0.28, y: d.y + Math.sin(angle) * 0.28 });
    }
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1.2;

  for (const seed of seeds) {
    trace(seed, 1);
    trace(seed, -1);
  }
  ctx.restore();
}

function trace(seed, direction) {
  const ds = 0.035 * direction;
  let x = seed.x;
  let y = seed.y;
  ctx.beginPath();
  const start = worldToScreen({ x, y });
  ctx.moveTo(start.x, start.y);

  for (let k = 0; k < 175; k++) {
    if (x < world.xMin || x > world.xMax || y < world.yMin || y > world.yMax) break;
    let b = fieldAt(x, y);
    let mag = Math.hypot(b.x, b.y);
    if (!Number.isFinite(mag) || mag < 1e-7) break;

    const k1x = b.x / mag;
    const k1y = b.y / mag;
    b = fieldAt(x + 0.5 * ds * k1x, y + 0.5 * ds * k1y);
    mag = Math.hypot(b.x, b.y);
    if (!Number.isFinite(mag) || mag < 1e-7) break;

    x += ds * b.x / mag;
    y += ds * b.y / mag;
    const p = worldToScreen({ x, y });
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawDipoles(fg, muted, southColor, northColor) {
  dipoles.forEach((d, i) => {
    const center = worldToScreen(d);
    const length = 52 + d.m * 26;
    const ux = Math.cos(d.theta);
    const uy = -Math.sin(d.theta);
    const tail = { x: center.x - ux * length * 0.5, y: center.y - uy * length * 0.5 };
    const head = { x: center.x + ux * length * 0.5, y: center.y + uy * length * 0.5 };

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 12;
    ctx.strokeStyle = southColor;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(center.x, center.y);
    ctx.stroke();
    ctx.strokeStyle = northColor;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    ctx.lineWidth = i === selected ? 3 : 1.5;
    ctx.strokeStyle = i === selected ? fg : muted;
    ctx.fillStyle = fg;
    drawArrow(center.x - ux * length * 0.36, center.y - uy * length * 0.36, head.x, head.y, 11);

    ctx.beginPath();
    ctx.arc(center.x, center.y, i === selected ? 13 : 10, 0, Math.PI * 2);
    ctx.fillStyle = i === selected ? fg : muted;
    ctx.fill();
    ctx.restore();
  });
}

function drawArrow(x1, y1, x2, y2, headSize) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(angle - 0.55) * headSize, y2 - Math.sin(angle - 0.55) * headSize);
  ctx.lineTo(x2 - Math.cos(angle + 0.55) * headSize, y2 - Math.sin(angle + 0.55) * headSize);
  ctx.closePath();
  ctx.fill();
}

function updatePanel() {
  const d = dipoles[selected];
  controls.gridValue.value = `${controls.grid.value} px`;
  controls.selectedInfo.textContent = `dipole ${selected + 1}: x ${d.x.toFixed(2)}, y ${d.y.toFixed(2)}`;
  controls.moment.value = d.m;
  controls.momentValue.value = d.m.toFixed(2);
  const deg = radToDeg(d.theta);
  controls.angle.value = deg;
  controls.angleValue.value = `${Math.round(deg)} deg`;
}

function radToDeg(theta) {
  let deg = theta * 180 / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height
  };
}

function hitTest(pos) {
  for (let i = dipoles.length - 1; i >= 0; i--) {
    const d = dipoles[i];
    const center = worldToScreen(d);
    const length = 52 + d.m * 26;
    const head = {
      x: center.x + Math.cos(d.theta) * length * 0.5,
      y: center.y - Math.sin(d.theta) * length * 0.5
    };

    if (Math.hypot(pos.x - head.x, pos.y - head.y) < 22) return { index: i, mode: "rotate" };
    if (Math.hypot(pos.x - center.x, pos.y - center.y) < 28) return { index: i, mode: "move" };
  }
  return null;
}

canvas.addEventListener("pointerdown", (event) => {
  const pos = pointerPosition(event);
  const hit = hitTest(pos);
  if (!hit) return;
  selected = hit.index;
  const d = dipoles[selected];
  const w = screenToWorld(pos);
  drag = { mode: hit.mode, dx: d.x - w.x, dy: d.y - w.y };
  canvas.setPointerCapture(event.pointerId);
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const pos = pointerPosition(event);
  const w = screenToWorld(pos);
  const d = dipoles[selected];

  if (drag.mode === "move") {
    d.x = clamp(w.x + drag.dx, world.xMin + 0.15, world.xMax - 0.15);
    d.y = clamp(w.y + drag.dy, world.yMin + 0.15, world.yMax - 0.15);
  } else {
    d.theta = Math.atan2(w.y - d.y, w.x - d.x);
  }
  draw();
});

canvas.addEventListener("pointerup", (event) => {
  drag = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

document.getElementById("addMagnet").addEventListener("click", () => {
  const offset = dipoles.length * 0.3;
  dipoles.push({ x: clamp(-0.6 + offset, world.xMin + 0.4, world.xMax - 0.4), y: 0.6, m: 1.2, theta: Math.PI / 2 });
  selected = dipoles.length - 1;
  draw();
});

document.getElementById("removeMagnet").addEventListener("click", () => {
  if (dipoles.length <= 1) return;
  dipoles.splice(selected, 1);
  selected = Math.max(0, selected - 1);
  draw();
});

document.getElementById("reset").addEventListener("click", () => {
  dipoles = defaultDipoles.map(copyDipole);
  selected = 0;
  controls.scaleC.value = "1.0";
  controls.softening.value = "0.16";
  controls.alpha.value = "3.0";
  controls.powerN.value = "3.0";
  controls.grid.value = "30";
  controls.showStreamlines.checked = true;
  controls.showVectors.checked = true;
  draw();
});

for (const input of [
  controls.scaleC,
  controls.softening,
  controls.alpha,
  controls.powerN,
  controls.grid,
  controls.showStreamlines,
  controls.showVectors
]) {
  input.addEventListener("input", draw);
}

controls.moment.addEventListener("input", () => {
  dipoles[selected].m = Number(controls.moment.value);
  draw();
});

controls.angle.addEventListener("input", () => {
  dipoles[selected].theta = Number(controls.angle.value) * Math.PI / 180;
  draw();
});

draw();
