const axios = require('axios');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 1. プロキシの指定
// ※後で作成するDocker Composeで、Squidコンテナの名前を「proxy」とする前提です。
const proxyUrl = 'http://proxy:3128';
const httpAgent = new HttpProxyAgent(proxyUrl);
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// 2. HTTPクライアント(axios)の初期設定
// これにより、この client を使った通信はすべて自動的にプロキシを経由します。
const client = axios.create({
  httpAgent: httpAgent,
  httpsAgent: httpsAgent,
  proxy: false // axios自体のデフォルトプロキシ機能を無効化し、上記のAgentを優先する
});

async function checkCommunication() {
  console.log('--- Egressプロキシ通信テストを開始します ---\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // テスト1：許可されるはずの通信 (httpbin.org)
  try {
    console.log('宛先: http://httpbin.org/get (許可リスト対象)');
    const res1 = await client.get('http://httpbin.org/get');
    // HTTPステータスコード200が返ってきたら成功
    console.log(`✅ 結果: 通信成功 (Status: ${res1.status})`);
  } catch (error) {
    console.log(`❌ 結果: エラー (${error.message})`);
  }

  console.log('\n----------------------------------------\n');

  // テスト2：拒否されるはずの通信 (yahoo.co.jp)
  try {
    console.log('宛先: https://yahoo.co.jp (許可リスト対象外)');
    const res2 = await client.get('https://yahoo.co.jp');
    // ここで200が返ってきたら、ブロックできていないので「設計上は失敗」
    console.log(`❌ 結果: 通信できてしまった (Status: ${res2.status})`);
  } catch (error) {
    // Squidがブロックして403を返してくるのが「正解」の挙動
    if (error.response && error.response.status === 403) {
      console.log(`✅ 結果: 想定通りブロックされました (Status: ${error.response.status})`);
    } else {
      console.log(`⚠️ 結果: 予期せぬエラー (${error.message})`);
    }
  }
}

// 処理の実行
checkCommunication();