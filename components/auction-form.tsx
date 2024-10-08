"use client"

import { useEffect, useRef, useState } from 'react'
// @ts-ignore
import typeMaterials from './typeMaterials.yml'

import { Textarea } from "@/components/ui/textarea"
import { Button } from './ui/button'
import { CardContent } from './ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from '@/components/ui/input'
import { ArrowUpDown, LoaderCircle, PackageMinus, PackagePlus, Router, Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { z } from 'zod'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslations } from 'next-intl'
import { useToast } from "@/hooks/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { sendMail } from '@/lib/mail'

interface ItemData {
  volume: number
  name: string
  materials: { [x: number]: number }
  materialsManual: { [x: number]: number }
  manualPrice: number
  buy: number
  sell: number
}

interface AuctionItem {
  id: number
  itemName: string
  itemCategory: "自动月矿" | "手动月矿" | "天钩"
  auctionStatus: "拍卖中" | string
  auctionInfo: string
  regionName: "Catch" | "Querious"
  systemName: string
  itemDetail: string
  startTime: string
  startPrice: string

  costIndex: number
  value: number
  matchedCi: number
  fromStartHrs: number
  price: number
}

interface AuctionRule {
  regionName: "Catch" | "Querious"
  costIndex: number
  itemCategory: "自动月矿" | "手动月矿" | "天钩"
}

interface Bids {
  [x: number]: number
}

const RulesFormSchema = z.object({
  region: z.string({ required_error: "Please select an region" }),
  category: z.string({ required_error: "Please select a category" }),
  costIndex: z.string({ required_error: "Please input a cost index number" })
})

export default function AuctionForm() {
  const [token, setToken] = useState("")
  const [auctionList, setAuctionList] = useState<AuctionItem[]>([])
  const [rules, setRules] = useState<AuctionRule[]>([])
  const [ciDesc, setCiDesc] = useState(true)
  const [filter, setFilter] = useState<keyof AuctionItem | "">("")
  const [regionDesc, setRegionDesc] = useState(true)
  const [valueDesc, setValueDesc] = useState(true)
  const [statusDesc, setStatusDesc] = useState(true)
  const [excludeList, setExcludeList] = useState<string[]>([])

  const marketDataRef = useRef<any>({})
  const marketQueryKeysRef = useRef<number[]>([])

  const { toast } = useToast()

  const categoryMap = {
    "天钩": "skyhook",
    "自动月矿": "metenox",
    "手动月矿": "athanor"
  }

  const t = useTranslations("auction")

  useEffect(() => {
    setToken(sessionStorage["token"] || "")
    setRules(JSON.parse(localStorage["rules"] || "[]"))
    setExcludeList(JSON.parse(localStorage["excludeList"] || "[]"))
  }, [])

  /**
   * 根据定义的规则匹配拍卖物品
   * @param auctionItem Auction item
   * @returns 匹配到最低的 Cost Index
   */
  const matchRule = (auctionItem: AuctionItem) => {
    let costIndex = Infinity
    if (excludeList.includes(auctionItem.itemName)) return costIndex

    rules.forEach((rule) => {
      if (auctionItem.itemCategory !== rule.itemCategory) return
      if (auctionItem.regionName !== rule.regionName) return
      costIndex = Math.min(costIndex, rule.costIndex)
    })

    return costIndex
  }

  /**
   * 对拍卖列表进行排序
   * @param key 需要排序的 Key
   * @returns 排序完的列表
   */
  const sortAuctionItem = (key: keyof AuctionItem | "") => {
    const rawAuctionList = auctionList
    const desc = (() => {
      switch (key) {
        case "costIndex":
          return ciDesc
        case "regionName":
          return regionDesc
        case "value":
          return valueDesc
        case "auctionInfo":
          return statusDesc
        default:
          return true
      }
    })()

    if (key === "") return auctionList

    rawAuctionList.sort((a: AuctionItem, b: AuctionItem) => {
      return (a[key] === b[key]) ? 0 : (desc ? (a[key] < b[key] ? 1 : -1) : (a[key] > b[key] ? 1 : -1));
    })

    return rawAuctionList
  }

  /**
   * 从服务器获取拍卖列表，格式化后并更新 auctionList 状态
   * @returns void
   */
  const getAuctionList = async () => {
    if (!token) return
    try {
      const rawAuctionList: { total: number, data: AuctionItem[] } = (await (await fetch("https://tools.dc-eve.com/qq/auction/page", {
        method: "POST",
        body: JSON.stringify({
          itemName: "",
          systemId: [],
          constellationId: [],
          regionId: [],
          auctionStatus: ["1"],
          category: [],
          page: 1,
          size: 999
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Cookie: `tools_remember=${token}`,
          Accept: '*/*'
        }
      })).json()).data

      if (rawAuctionList.total === 0) setToken("")

      // 格式化数据以适配数据处理api
      const rawItems = rawAuctionList.data.reduce((a, c) => {
        return `${a}\n${c.itemDetail}`
      }, "")

      const formatedItems = await (await fetch('/api/format', {
        method: 'POST', body: JSON.stringify({
          data: rawItems
        })
      })).json()

      const rows = formatedItems.result.split("\n")
      const items = [] as ItemData[]
      const marketItemsMap = new Map<number, boolean>()
      const current = {
        name: "",
        materials: {},
        materialsManual: {},
        volume: 0
      } as ItemData
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].split(" ").length !== 1) {
          if (current.name) items.push({ ...current })
          current.name = rows[i].replaceAll("\t", "")
          current.materials = {}
          current.materialsManual = {}
          current.volume = 0
        } else if (rows[i] !== "" && rows[i] !== "skyhook") {
          const row = rows[i].split("\t")
          const [_, __, quantity, id] = row

          // Metenox钻机可获取到的元素不包含普矿
          const materialsCanBeMined = typeMaterials[id]?.materials.filter((material: { materialTypeID: number }) => material.materialTypeID > 100)

          // 分隔 R4 R8 R16 R32 的物品id
          const oreMap = {
            4: 45493,
            8: 45497,
            16: 45501,
            32: 45506
          }

          if (parseInt(id) > oreMap[8]) {
            current.volume += Math.floor(30 * parseFloat(quantity)) * 10 * 100
            typeMaterials[id]?.materials.forEach((materail: { materialTypeID: number, quantity: number }) => {
              current.materialsManual[materail.materialTypeID] = (current.materialsManual[materail.materialTypeID] || 0) + Math.floor(Math.floor(materail.quantity * 30 * parseFloat(quantity)) * 0.87)
            })
          }

          materialsCanBeMined.forEach((materail: { materialTypeID: number, quantity: number }) => {
            current.materials[materail.materialTypeID] = (current.materials[materail.materialTypeID] || 0) + Math.floor(materail.quantity * 12 * parseFloat(quantity))
            marketItemsMap.set(materail.materialTypeID, true)
          })
        }
      }

      if (current.name) items.push({ ...current })

      const marketItems = [81143]
      marketItemsMap.forEach((_, key) => { marketItems.push(key) })

      let _marketData = marketDataRef.current

      const marketQueryKeysSet = new Set(marketQueryKeysRef.current);
      
      if (!marketItems.every(item => marketQueryKeysSet.has(item))) {
        _marketData = await (await fetch("https://eve.c3q.cc/market/api/", {
          method: 'post', headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          }, body: new URLSearchParams({
            queryBuyAssess: JSON.stringify(marketItems),
            buy_location_id: "[30000142]",
            querySellAssess: JSON.stringify(marketItems),
            sell_location_id: "[30000142]"
          }).toString()
        })).json()

        marketDataRef.current = _marketData
        marketQueryKeysRef.current = marketItems
      }

      // const marketData = await (await fetch("https://eve.c3q.cc/market/api/", {
      //   method: 'post', headers: {
      //     'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      //   }, body: new URLSearchParams({
      //     queryBuyAssess: JSON.stringify(marketItems),
      //     buy_location_id: "[30000142]",
      //     querySellAssess: JSON.stringify(marketItems),
      //     sell_location_id: "[30000142]"
      //   }).toString()
      // })).json()

      items.forEach((item, index) => {
        if (rawAuctionList.data[index].itemCategory === "天钩") {
          item.buy = parseInt(rawAuctionList.data[index].itemDetail.split("[")[1].split("]")[0]) * _marketData.queryBuyAssess.result[81143].max_price.price
          return
        }

        let sell = 0
        let buy = 0
        let manual = 0
        Object.keys(item.materials).forEach((key) => {
          sell += item.materials[parseInt(key)] * _marketData.querySellAssess.result[key].min_price.price
          buy += item.materials[parseInt(key)] * _marketData.queryBuyAssess.result[key].max_price.price
        })

        Object.keys(item.materialsManual).forEach((key) => {
          manual += item.materialsManual[parseInt(key)] * _marketData.queryBuyAssess.result[key].max_price.price
        })

        item.buy = buy
        item.sell = sell
        item.manualPrice = manual
      })

      rawAuctionList.data.forEach((auctionItem, index) => {
        const matchedCostIndex = matchRule(auctionItem)
        const fromStartHrs = Math.ceil((new Date().getTime() - (new Date(auctionItem.startTime).getTime() + 8 * 3600 * 1000)) / 1000 / 3600)

        const bids: Bids = JSON.parse(localStorage["bids"] || "{}")

        const bid = auctionItem.auctionInfo === "当前无人竞拍" ? parseInt(auctionItem.startPrice.replaceAll(",", "")) + 1 :
          parseInt(auctionItem.auctionInfo.replace("当前第二高拍卖价为", "").replace("当前你的公司是最高出价:", "").replaceAll(",", ""))
        const benefit = (() => {
          switch (auctionItem.itemCategory) {
            case "天钩":
              return items[index].buy
            case "手动月矿":
              return items[index].manualPrice
            case "自动月矿":
              return items[index].buy - _marketData.queryBuyAssess.result[81143].max_price.price * 55 - 90000
          }
        })() * 24 * 90

        let price = bid || parseInt(auctionItem.startPrice.replaceAll(",", ""))
        if (auctionItem.auctionInfo.startsWith("当前第二高拍卖价为")) {
          if (auctionItem.itemCategory === "自动月矿") {
            price = Math.floor((Math.max(bids[auctionItem.id] || 0, price) + 25_000_000) / 5_000_000) * 5_000_000
          } else {
            price = Math.floor((Math.max(bids[auctionItem.id] || 0, price) + 100_000_000) / 10_000_000) * 10_000_000
          }
        }

        if (sessionStorage["equalBid"] === String(auctionItem.id)) {
          price = price + 1
          sessionStorage["equalBid"] = ""
        }

        auctionItem.costIndex = ((benefit - price) / price)
        auctionItem.value = benefit
        auctionItem.matchedCi = matchedCostIndex
        auctionItem.fromStartHrs = fromStartHrs
        auctionItem.price = price
      })

      setAuctionList(rawAuctionList.data)
    } catch (e) {
      toast({
        title: t("networkError"),
        description: String(e)
      })
    }
  }

  // useEffect 钩子用于管理拍卖列表更新、轮询和拍卖逻辑
  useEffect(() => {
    setAuctionList([])
    getAuctionList()
  }, [rules, excludeList])

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeout(getAuctionList, Math.random() * 1_500)
    }, 60_000)

    // getAuctionList();

    return () => clearInterval(interval);
  }, [token, rules, excludeList, auctionList])

  useEffect(() => {
    getAuctionList()
  }, [token, rules, excludeList])


  useEffect(() => {
    if (!auctionList.length) return

    let bidFlag = false

    const bidWithDelay = async (item: any, index: number) => {
      if (bidFlag) return
      if (item.costIndex >= item.matchedCi && !item.auctionInfo.startsWith("当前你的公司是最高出价")/* && item.fromStartHrs >= 24 * 4 - 2*/) {
        bidFlag = true
        const bids = JSON.parse(localStorage["bids"] || "{}")
        toast({
          title: `${t("bidFor")} ${item.itemName}`,
          description: `${t("bidPriceIs")} ${item.price.toLocaleString()}`
        })

        bids[item.id] = item.price

        try {
          const bidResult = await (await fetch("https://tools.dc-eve.com/qq/auction/submit", {
            method: "POST", body: JSON.stringify({
              id: item.id,
              price: item.price
            }), headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Cookie: `tools_remember=${token}`
            }
          })).json()

          console.warn(bidResult)

          if (bidResult.code !== 200 && bidResult.code !== 429) {
            // bids[item.id] = item.price + 1
            // localStorage["bids"] = JSON.stringify(bids)
            sessionStorage["equalBid"] = item.id
            throw new Error(bidResult.message)
          }

          if (bidResult.code !== 200) {
            throw new Error(bidResult.message)
          }

          localStorage["bids"] = JSON.stringify(bids)

          console.warn("++++ bidded", item.itemName, "in region", item.regionName, "for", item.price, "with cost index", item.costIndex, "/", item.matchedCi)
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          toast({
            title: t("networkError"),
            description: String(e)
          })
        }
      }
    }

    const processBids = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      for (let i = 0; i < auctionList.length; i++) {
        await bidWithDelay(auctionList[i], i)
        if (bidFlag) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          setAuctionList([])
          getAuctionList()
          break
        }
      }
    }

    processBids()

  }, [auctionList])

  const rulesForm = useForm<z.infer<typeof RulesFormSchema>>({
    resolver: zodResolver(RulesFormSchema),
    defaultValues: {
      costIndex: "1"
    }
  })

  /**
   * 添加新的拍卖规则
   * @param data 表单数据
   */
  const onSubmit = (data: z.infer<typeof RulesFormSchema>) => {
    const _rules = [...rules, {
      costIndex: parseFloat(data.costIndex),
      regionName: data.region as "Catch" | "Querious",
      itemCategory: data.category as "自动月矿" | "手动月矿"
    }]
    setRules(_rules)
    localStorage["rules"] = JSON.stringify(_rules)
  }

  return <>
    <CardContent>
      {token ? <div className='flex flex-col gap-2'>
        <Table>
          <TableHeader>
            <TableRow>
              {/* <TableHead className="w-[120px]">{t("ruleId")}</TableHead> */}
              <TableHead>{t("category")}</TableHead>
              <TableHead>{t("region")}</TableHead>
              <TableHead className="text-right">{t("costIndex")}</TableHead>
              <TableHead className="text-right">{t("operation")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {
              rules.map((rule, index) => {
                return <TableRow key={index}>
                  {/* <TableCell className="w-[120px]">{index}</TableCell> */}
                  <TableCell>{t(categoryMap[rule.itemCategory])}</TableCell>
                  <TableCell>{rule.regionName}</TableCell>
                  <TableCell className="text-right">{rule.costIndex}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" onClick={() => {
                      const _rules = rules.filter(_rule => _rule !== rule)
                      setRules(_rules)
                      localStorage["rules"] = JSON.stringify(_rules)
                    }}>
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              })
            }
            {
              excludeList.map((rule, index) => {
                return <TableRow key={index}>
                  {/* <TableCell className="w-[120px]">Exclude-{index}</TableCell> */}
                  <TableCell>{rule}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right"></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" onClick={() => {
                      const _excludeList = excludeList.filter(_rule => _rule !== rule)
                      setExcludeList(_excludeList)
                      localStorage["excludeList"] = JSON.stringify(_excludeList)
                    }}>
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              })
            }
          </TableBody>
        </Table>
        <div>
          <Form {...rulesForm}>
            <form onSubmit={rulesForm.handleSubmit(onSubmit)} className='flex gap-2'>
              <FormField
                control={rulesForm.control}
                name="region"
                render={({ field }) => (<Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("regionTip")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t("region")}</SelectLabel>
                      <SelectItem value="Querious">{t("querious")}</SelectItem>
                      <SelectItem value="Catch">{t("catch")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>)}
              />
              <FormField
                control={rulesForm.control}
                name="category"
                render={({ field }) => (<Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("categoryTip")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t("category")}</SelectLabel>
                      <SelectItem value="自动月矿">{t("metenox")}</SelectItem>
                      <SelectItem value="手动月矿">{t("athanor")}</SelectItem>
                      <SelectItem value="天钩">{t("skyhook")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>)}
              />
              <FormField
                control={rulesForm.control}
                name="costIndex"
                render={({ field }) => (<FormItem>
                  <FormControl>
                    <Input type="number" placeholder={t("minCostIndex")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>)}
              />
              <Button type="submit">{t("addRule")}</Button>
            </form>
          </Form>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("category")}</TableHead>
              <TableHead>
                <div className='flex items-center justify-start gap-1'>
                  {t("region")}
                  <Button variant="ghost" className='p-2'
                    onClick={() => {
                      setRegionDesc(!regionDesc)
                      setFilter("regionName")
                    }}
                  >
                    <ArrowUpDown className='w-4 h-4' />
                  </Button>
                </div>
              </TableHead>
              <TableHead>{t("system")}</TableHead>
              <TableHead>
                <div className='flex items-center justify-start gap-1'>
                  {t("value")}
                  <Button variant="ghost" className='p-2'
                    onClick={() => {
                      setValueDesc(!valueDesc)
                      setFilter("value")
                    }}
                  >
                    <ArrowUpDown className='w-4 h-4' />
                  </Button>
                </div>
              </TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="text-right">
                <div className='flex items-center justify-end gap-1'>
                  {t("currentCostIndex")}
                  <Button variant="ghost" className='p-2'
                    onClick={() => {
                      setCiDesc(!ciDesc)
                      setFilter("costIndex")
                    }}
                  >
                    <ArrowUpDown className='w-4 h-4' />
                  </Button></div>
              </TableHead>
              <TableHead className="text-right">
                <div className='flex items-center justify-end gap-1'>
                  {t("status")}
                  <Button variant="ghost" className='p-2'
                    onClick={() => {
                      setStatusDesc(!statusDesc)
                      setFilter("auctionInfo")
                    }}
                  >
                    <ArrowUpDown className='w-4 h-4' />
                  </Button>
                </div>
              </TableHead>
              <TableHead className="text-right">{t("timeLeft")}</TableHead>
              <TableHead className="text-right">{t("operation")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {
              auctionList.length ?
                sortAuctionItem(filter)
                  .filter(item => item.auctionStatus !== "已结束")
                  .map((item, index) => {
                    return <TableRow key={index}>
                      <TableCell>{t(categoryMap[item.itemCategory])}</TableCell>
                      <TableCell>{t(item.regionName.toLocaleLowerCase())}</TableCell>
                      <TableCell>{item.systemName}</TableCell>
                      <TableCell>{item.value.toLocaleString()}</TableCell>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell className="text-right" style={{
                        color: item.matchedCi > item.costIndex ? "red" : "green"
                      }}>{`${item.costIndex.toFixed(2)}${item.matchedCi === Infinity ? " / ∞" : ` / ${item.matchedCi}`}`}</TableCell>
                      <TableCell className="text-right">{item.auctionInfo}</TableCell>
                      <TableCell className="text-right">{24 * 4 + 12 - item.fromStartHrs} (±12) h</TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" onClick={() => {
                                if (excludeList.includes(item.itemName)) {
                                  const _excludeList = excludeList.filter((itemName) => itemName !== item.itemName)
                                  setExcludeList(_excludeList)
                                  localStorage["excludeList"] = JSON.stringify(_excludeList)
                                } else {
                                  const _excludeList =[...excludeList, item.itemName]
                                  setExcludeList(_excludeList)
                                  localStorage["excludeList"] = JSON.stringify(_excludeList)
                                }
                              }}>
                                {excludeList.includes(item.itemName) ? <PackagePlus className='h-4 w-4' /> : <PackageMinus className='h-4 w-4' />}

                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{excludeList.includes(item.itemName) ? t("removeFromExclude") : t("addToExclude")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  }) :
                <TableRow>
                  <TableCell colSpan={9}>
                    <LoaderCircle className='m-auto animate-spin w-4 h-4 my-4' stroke='gray' />
                  </TableCell>
                </TableRow>
            }
          </TableBody>
        </Table>
      </div> : <Textarea
        value={token}
        onChange={(e) => {
          setToken(e.target.value)
          sessionStorage["token"] = e.target.value
        }}
        className=' resize-none h-[60vh]'
        placeholder={t("tokenTip")}
      />}
    </CardContent>
  </>
}