const app = require('./app');

const port = Number(process.env.PORT || 8000);

app.listen(port, () => {
  process.stdout.write(`Bridge API running on port ${port}\n`);
});
