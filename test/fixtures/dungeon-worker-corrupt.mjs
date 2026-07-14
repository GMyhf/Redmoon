process.stderr.write("worker diagnostic\n");
process.stdout.write(Buffer.from([0, 0, 0, 1, 0x78]));
setInterval(() => {}, 1_000);
