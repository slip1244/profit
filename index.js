(async () => {
  await require("./persist.js")(["positions.json"])
})()
const fs = require("fs")
const config = require("./config.json")
const http = require("http")
const axios = require("axios")
const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.write("discord illegal")
  res.end()
}).listen(8080)
const Discord = require("discord.js")
const Client = new Discord.Client()
Client.login(config.token)
Client.on("ready", async  () => {
  console.log("ready")
})

const tokens = require("./tokens.json")
const coins = require("./coins.json")

let positions
getPositions()

const prices = {}

let ethPrice

updatePrices()
setInterval(updatePrices, 10000)

async function updatePrices() {
  for (const position of positions) {
    const temp = []
    if (!temp.includes(position.s)) {
      temp.push(position.s)
      prices[position.s] = await getValue(await getPair(position.s))
    }
  }
  ethPrice = (await axios("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")).data.ethereum.usd
}


Client.on("message", (msg) => {
  if (msg.content.startsWith("!s ")) {
    const args = msg.content.split(" ").slice(1)
    if (args[0] === "a" || args[0] === "add") {
      if (args.length >= 4) {
        for (const position of positions) {
          if (position.u == msg.author.id && position.s == args[1].toLowerCase()) {
            msg.react("😡")
            return
          }
        }
        args[3] = args[3].replace(/,/g, "")
        if (+args[3]) {
          positions.push({
            u: msg.author.id,
            s: args[1].toLowerCase(),
            e: +args[2] / +args[3],
            a: +args[3]
          })
          writePositions()
          updatePrices()
          msg.react("✅")
        } else {
          msg.react("😡")
        }
      } else {
        msg.react("😡")
      }
    } else if (args[0] === "l" || args[0] === "list") {
      list(msg)
    } else if (args[0] === "r" || args[0] === "remove") {
      if (args.length >= 2) {
        for (let i = 0; i < positions.length; i++) {
          if (positions[i].u == msg.author.id && positions[i].s == args[1].toLowerCase()) {
            positions.splice(i, 1)
            msg.react("✅")
            writePositions()
            return
          }
        }
        msg.react("😡")
      } else {
        msg.react("😡")
      }
    }
  } else if (msg.content === "!s") {
    list(msg)
  }
})

async function list(msg) {
  const listEmbed = new Discord.MessageEmbed().setColor("#d55656")
  getPositions()
  if (positions.length) {
    listEmbed.setTitle("Positions").addFields(
      {name: "User", value: positions.map(p => `${msg.author.id === p.u ? "➤ " : ""}<@${p.u}> (${p.s.toUpperCase()})`).join("\n"), inline: true},
      {name: "Entry", value: positions.map(p => `<:ETH:809232299920719893>${(p.a * p.e).toFixed(3)} at ${p.e.toExponential(3)}`).join("\n"), inline: true},
      {name: "Profit vs ETH", value: positions.map(p => `<:ETH:809232299920719893>${(p.a * (prices[p.s].priceETH - p.e)).toFixed(3)} | $${(ethPrice * p.a * (prices[p.s].priceETH - p.e)).toFixed(2)} | ${(((prices[p.s].priceETH - p.e) / p.e) * 100).toFixed(2)}%`).join("\n"), inline: true}
    )
  } else {
    listEmbed.setTitle("No Positions")
  }
  msg.channel.send(listEmbed)
}

async function getPair(symbol) {
  if (coins[symbol.toUpperCase()]) {
    return {type: "coin", symbol: coins[symbol.toUpperCase()]}
  } else {
    symbol = symbol.toUpperCase()

    // Get Uniswap value
    const id = (tokens[symbol.toUpperCase()] ? await axios({
        url: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
        method: "POST",
        headers: { 
            "content-type": "application/json"
        },
        data: {
            operationName: "tokens",
            query: `query tokens($id: String) {
              asSymbol: tokens(where: {id: $id}) {
                id
                name
              }
            }`,
            variables: {
                id: tokens[symbol.toUpperCase()]
            }
        }
    }) : await axios({
        url: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
        method: "POST",
        headers: { 
            "content-type": "application/json"
        },
        data: {
            operationName: "tokens",
            query: `query tokens($symbol: String) {
              asSymbol: tokens(where: {symbol: $symbol}, orderBy: tradeVolumeUSD, orderDirection: desc) {
                id
                name
              }
            }`,
            variables: {
                symbol: symbol
            }
        }
    }))


    const tokenData = id.data.data.asSymbol[0]
    if (!tokenData) {
      return {type: null}
    }
    const tokenId = tokenData.id
    const tokenName = tokenData.name
    let tokenPriceETH = await axios({
      url: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
      method: "POST",
      headers: { 
          "content-type": "application/json"
      },
      data: {
          operationName: "pairs",
          query: `query pairs($id: String) {
            asId: pairs(where: {token0: $id, token1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"}) {
              id
              token1Price
            }
          }`,
          variables: {
              id: (tokens[symbol.toUpperCase()] ? tokens[symbol.toUpperCase()] : tokenId)
          }
      }
    })
    if (tokenPriceETH.data.data.asId[0]) {
      return {type: "token", id: tokenPriceETH.data.data.asId[0].id, order: true}
    } else {
      let tokenPriceETH = await axios({
        url: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
        method: "POST",
        headers: { 
            "content-type": "application/json"
        },
        data: {
            operationName: "pairs",
            query: `query pairs($id: String) {
              asId: pairs(where: {token0: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", token1: $id}) {
                id
                token0Price
              }
            }`,
            variables: {
                id: (tokens[symbol] ? tokens[symbol] : tokenId)
            }
        }
      })
      if (tokenPriceETH.data.data.asId[0]) {
        return {type: "token", id: tokenPriceETH.data.data.asId[0].id, order: false}
      } else {
        console.log("this")
      }
    }
  }
}

async function getValue(pair) {
  if (pair.type === "coin") {
    const price = await axios(`https://api.coingecko.com/api/v3/simple/price?ids=${pair.symbol}&vs_currencies=usd,eth`)
    return {priceUSD: price.data[pair.symbol].usd, priceETH: price.data[pair.symbol].eth}
  } else {
    const [eth, tokenPriceETH] = await Promise.all([
      axios("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"),
      axios({
      url: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
      method: "POST",
      headers: { 
          "content-type": "application/json"
      },
      data: {
          operationName: "pairs",
          query: `query pairs($id: String) {
            asId: pairs(where: {id: $id}) {
              id
              token1Price
              token0Price
            }
          }`,
          variables: {
              id: pair.id
          }
      }
    })])
    return {priceETH: +tokenPriceETH.data.data.asId[0][pair.order ? "token1Price" : "token0Price"], priceUSD: tokenPriceETH.data.data.asId[0][pair.order ? "token1Price" : "token0Price"] * eth.data.ethereum.usd}
  }
}

function getPositions() {
  positions = JSON.parse(fs.readFileSync(`./positions.json`));
}

function writePositions() {
  fs.writeFileSync("./positions.json", JSON.stringify(positions))
}