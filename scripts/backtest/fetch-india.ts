import { fetchAndCacheAll, getAllSymbols } from './fetch-data';
async function main() {
  const { india } = getAllSymbols();
  console.log(`Fetching ${india.length + 1} India symbols...`);
  const result = await fetchAndCacheAll([...india, '^NSEI']);
  console.log(`Done: ${result.success} cached, ${result.failed.length} failed`);
  if (result.failed.length > 0) console.log('Failed:', result.failed.join(', '));
}
main();
