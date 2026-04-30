const fs = require('fs');
const file = 'src/sim/engine.ts';
let code = fs.readFileSync(file, 'utf8');

// Update angle in decideDump
code = code.replace(
  /const angle = 0;/,
  `const angle = -Math.PI / 3; // Oriented for diagonal packing`
);

// Replace buildColumnSlots
const buildColumnSlotsRegex = /function buildColumnSlots\([\s\S]*?return slots;\n}/;
const newBuildColumnSlots = `function buildColumnSlots(
  left: number,
  right: number,
  top: number,
  bottom: number,
  rx: number,
  ry: number,
) {
  const slots: ColumnSlot[] = [];
  // Crisscross pattern (staggered) and controlled overlap for high density
  const xStep = Math.max(rx * 1.25, 6.0);
  const yStep = Math.max(ry * 1.4, 4.5);
  const midY = (top + bottom) / 2;

  let column = 0;
  for (let baseCx = right; baseCx >= left; baseCx -= xStep, column++) {
    let row = 0;
    for (let cy = top; cy <= bottom + yStep; cy += yStep, row++) {
      // Stagger alternate columns to create crisscross pattern
      let actualCy = cy;
      if (column % 2 === 1) {
        actualCy += yStep / 2;
      }
      if (actualCy > bottom) continue;

      // Curved sequential dumping: curve follows the boundary
      const dy = actualCy - midY;
      const curveShift = 0.0025 * dy * dy;
      const cx = baseCx - curveShift;

      if (cx >= left) {
        slots.push({ cx, cy: actualCy, column, row });
      }
    }
  }

  // Sort slots to ensure sequential filling from top-right along the curve
  // We want to fill one curved column at a time, starting from the right.
  // Inside a column, we can fill from top to bottom (or bottom to top).
  // The image shows the sequence arrow following the curve from top to bottom.
  slots.sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column;
    return a.cy - b.cy;
  });

  return slots;
}`;

code = code.replace(buildColumnSlotsRegex, newBuildColumnSlots);

fs.writeFileSync(file, code);
