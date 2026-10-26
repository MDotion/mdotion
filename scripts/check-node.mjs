const min = [20, 11, 0];
const v = process.version.slice(1).split('.').map((n) => Number(n));

function belowMinimum() {
  for (let i = 0; i < 3; i += 1) {
    if ((v[i] ?? 0) < min[i]) return true;
    if ((v[i] ?? 0) > min[i]) return false;
  }
  return false;
}

if (belowMinimum()) {
  console.error(
    `\n[mdotion] Node ${process.version} is too old. Use Node >= 20.11 (see .nvmrc).\n` +
      `  nvm install && nvm use\n`,
  );
  process.exit(1);
}
