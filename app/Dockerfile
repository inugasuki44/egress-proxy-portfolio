# 1. ベースとなるOSとNode.jsのバージョンを指定
# "alpine" はセキュリティが高く、容量が非常に軽いLinuxのミニマル版です。
FROM node:20-alpine

# 2. コンテナ内部での「作業用フォルダ」を作成・指定
WORKDIR /usr/src/app

# 3. 先に package.json だけをコンテナにコピー
# ※アスタリスク(*)は package-lock.json がある場合も一緒にコピーするためのおまじない
COPY package*.json ./

# 4. 前回の壁打ちで確認した「npm install」をここで実行！
# これによりコンテナ内に node_modules が作成され、準備が整います。
RUN npm install

# 5. 残りのコード本体（index.js など）をコンテナにコピー
COPY . .

# 6. コンテナが立ち上がった時に、最後に実行されるコマンド
CMD ["node", "index.js"]