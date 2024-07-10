"use client"

import { useRef, useState } from 'react'
// @ts-ignore
import typeMaterials from './typeMaterials.yml'

import { Textarea } from "@/components/ui/textarea"
import { Button } from './ui/button'
import { CardContent, CardFooter } from './ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from './ui/input'

interface MoonData {
  name: string,
  materials: { [x: number]: number },
  buy: number,
  sell: number,
}

export default function DataProcessForm() {
  const [scanData, setScanData] = useState("")
  const [itemNameMap, setItemNameMap] = useState<{ [x: number]: string }>({})
  const [minBuy, setMinBuy] = useState("1000000")
  const [itemPriceMap, setItemPriceMap] = useState<any>()
  const [analyzeData, setAnalyzeData] = useState<MoonData[]>([])

  const calc = () => {
    const rows = scanData.split("\n")
    const moons = [] as MoonData[]
    const itemsMap = new Map<number, boolean>()
    const currentMoon = {
      name: "",
      materials: {}
    } as MoonData
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].split(" ").length !== 1) {
        if (currentMoon.name) moons.push({ ...currentMoon })
        // create a new moon
        currentMoon.name = rows[i].replaceAll("\t", "")
        currentMoon.materials = {}
      } else if (rows[i] !== "") {
        const row = rows[i].split("\t")
        const quantity = parseFloat(row[2])
        const id = row[3]

        const materialsCanBeMined = typeMaterials[id]?.materials.filter((material: { materialTypeID: number }) => material.materialTypeID > 100)

        materialsCanBeMined.forEach((materail: { materialTypeID: number, quantity: number }) => {
          currentMoon.materials[materail.materialTypeID] = (currentMoon.materials[materail.materialTypeID] || 0) + Math.floor(materail.quantity * 12 * quantity)
          itemsMap.set(materail.materialTypeID, true)
        })
      }
    }
    if (currentMoon.name) moons.push({ ...currentMoon })

    const items = [] as number[]
    itemsMap.forEach((_, key) => { items.push(key) })

    fetch("/api/itemName/batch", { method: 'post', body: JSON.stringify(items) })
      .then(resp => resp.json())
      .then(data => {
        setItemNameMap(data)
      })

    fetch("https://eve.c3q.cc/market/api/", {
      method: 'post', headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      }, body: new URLSearchParams({
        queryBuyAssess: JSON.stringify(items),
        buy_location_id: "[30000142]",
        querySellAssess: JSON.stringify(items),
        sell_location_id: "[30000142]"
      }).toString()
    })
      .then(resp => resp.json())
      .then(data => {
        setItemPriceMap(data)
        moons.forEach(moon => {
          let sell = 0
          let buy = 0
          Object.keys(moon.materials).forEach((key) => {
            sell += moon.materials[parseInt(key)] * data.querySellAssess.result[key].min_price.price
            buy += moon.materials[parseInt(key)] * data.queryBuyAssess.result[key].max_price.price
          })
          moon.buy = buy
          moon.sell = sell
        })
        // console.log(moons)
        setAnalyzeData(moons)
      })


    // console.log(moons)



  }

  return <>
    <CardContent>
      <div className='flex gap-2 mb-4 items-center'>
        <div className='text-nowrap'>最低显示价值</div>
        <Input type="number" value={minBuy} onChange={(e) => setMinBuy(e.target.value)}></Input>
      </div>
      {analyzeData.length ? <>
        {analyzeData.map((row, index) => {
          return <div key={index} className={`${row.buy < parseInt(minBuy) || 0 ? 'hidden' : ''}`}>
            <div>
              {row.name}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">产物</TableHead>
                  <TableHead>每周期产出</TableHead>
                  <TableHead className="text-right">吉他卖单价格</TableHead>
                  <TableHead className="text-right">吉他收单价格</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.keys(row.materials).map((index) => {
                  // totSell += itemPriceMap.querySellAssess.result[index].min_price.price * row.materials[parseInt(index)]
                  // totBuy += itemPriceMap.queryBuyAssess.result[index].max_price.price * row.materials[parseInt(index)]

                  return <TableRow key={index}>
                    <TableCell className="w-[150px]">{itemNameMap[parseInt(index)]}</TableCell>
                    <TableCell>{row.materials[parseInt(index)]}</TableCell>
                    <TableCell className="text-right">{(itemPriceMap.querySellAssess.result[index].min_price.price * row.materials[parseInt(index)]).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{(itemPriceMap.queryBuyAssess.result[index].max_price.price * row.materials[parseInt(index)]).toLocaleString()}</TableCell>
                  </TableRow>
                })}
                <TableRow>
                  <TableCell className="w-[100px]">合计</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{row.sell.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.buy.toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        })}
      </> : <Textarea
        value={scanData}
        onChange={(e) => setScanData(e.target.value.replaceAll(/<localized hint="[\S]* [\S]* - [\S]* [\S]*">/g, "").replaceAll(/<\/localized>/g, "").replaceAll(/<localized hint="[\S]*">/g, ""))}
        className=' resize-none h-[60vh]'
      />}
    </CardContent>
    <CardFooter>
      {analyzeData.length ? <Button onClick={() => setAnalyzeData([])}>清除</Button> :
        <Button onClick={calc}>计算</Button>
      }
    </CardFooter>
  </>
}