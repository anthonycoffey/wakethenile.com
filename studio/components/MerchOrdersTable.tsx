import {useEffect, useMemo, useState, type CSSProperties} from 'react'
import {useClient} from 'sanity'
import {IntentLink} from 'sanity/router'
import {Box, Button, Card, Flex, Select, Spinner, Stack, Text, TextInput} from '@sanity/ui'

const API_VERSION = '2026-03-01'

const ORDERS_QUERY = `*[_type == "order"] | order(createdAt desc){
  _id,
  createdAt,
  customerName,
  email,
  fulfillmentStatus,
  lineItems[]{title, sku, qty, options}
}`

interface OrderOption {
  name?: string
  value?: string
}

interface OrderLineItem {
  title?: string
  sku?: string
  qty?: number
  options?: OrderOption[]
}

interface OrderDoc {
  _id: string
  createdAt?: string
  customerName?: string
  email?: string
  fulfillmentStatus?: string
  lineItems?: OrderLineItem[]
}

interface MerchRow {
  key: string
  orderId: string
  createdAt?: string
  customerName: string
  fulfillmentStatus: string
  orderType: 'Bundle' | 'Merch'
  item: string
  size: string
  qty: number
}

// Bundle line items carry a structured `options` array (Tee #1/Size #1, Tee
// #2/Size #2 — see ADR 0007); standalone merch has no options, and its
// variant label is baked into the Stripe-facing title as "<Product> — <Label>"
// (functions/api/checkout.ts). Split each line item into one row per shirt.
function flattenOrder(order: OrderDoc): MerchRow[] {
  const rows: MerchRow[] = []
  const customerName = order.customerName || order.email || 'Unknown'
  const fulfillmentStatus = order.fulfillmentStatus || 'unfulfilled'

  for (const [liIdx, li] of (order.lineItems || []).entries()) {
    const options = li.options || []
    const teeOpts = options.filter((o) => /^tee/i.test(o.name || ''))

    if (teeOpts.length) {
      teeOpts.forEach((teeOpt, i) => {
        const num = teeOpt.name?.match(/#(\d+)/)?.[1]
        const sizeOpt = options.find(
          (o) => /^size/i.test(o.name || '') && (num ? o.name?.includes(`#${num}`) : true),
        )
        rows.push({
          key: `${order._id}-${liIdx}-${i}`,
          orderId: order._id,
          createdAt: order.createdAt,
          customerName,
          fulfillmentStatus,
          orderType: 'Bundle',
          item: teeOpt.value || '',
          size: sizeOpt?.value || '',
          qty: li.qty || 1,
        })
      })
      continue
    }

    const title = li.title || 'Item'
    const dashIdx = title.indexOf(' — ')
    const item = dashIdx >= 0 ? title.slice(0, dashIdx) : title
    const size = dashIdx >= 0 ? title.slice(dashIdx + 3) : ''
    rows.push({
      key: `${order._id}-${liIdx}`,
      orderId: order._id,
      createdAt: order.createdAt,
      customerName,
      fulfillmentStatus,
      orderType: 'Merch',
      item,
      size,
      qty: li.qty || 1,
    })
  }

  return rows
}

function downloadCsv(rows: MerchRow[]) {
  const header = ['Date', 'Customer', 'Order type', 'Item', 'Size', 'Qty', 'Fulfillment', 'Order ID']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [
      r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US') : '',
      r.customerName,
      r.orderType,
      r.item,
      r.size,
      String(r.qty),
      r.fulfillmentStatus,
      r.orderId,
    ]
      .map((v) => escape(String(v)))
      .join(','),
  )
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `merch-orders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const cellStyle: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--card-border-color, #e2e2e2)',
  whiteSpace: 'nowrap',
}

export function MerchOrdersTable() {
  const client = useClient({apiVersion: API_VERSION})
  const [orders, setOrders] = useState<OrderDoc[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let mounted = true
    const fetchOrders = () => {
      client.fetch<OrderDoc[]>(ORDERS_QUERY).then((res) => {
        if (mounted) setOrders(res)
      })
    }
    fetchOrders()
    const sub = client
      .listen('*[_type == "order"]', {}, {visibility: 'query'})
      .subscribe(() => fetchOrders())
    return () => {
      mounted = false
      sub.unsubscribe()
    }
  }, [client])

  const allRows = useMemo(() => (orders ? orders.flatMap(flattenOrder) : []), [orders])

  const rows = useMemo(() => {
    let flat = allRows
    if (statusFilter !== 'all') flat = flat.filter((r) => r.fulfillmentStatus === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      flat = flat.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) ||
          r.item.toLowerCase().includes(q) ||
          r.size.toLowerCase().includes(q),
      )
    }
    return flat
  }, [allRows, statusFilter, search])

  if (!orders) {
    return (
      <Flex align="center" justify="center" padding={4} style={{height: '100%'}}>
        <Spinner muted />
      </Flex>
    )
  }

  return (
    <Box padding={4} style={{maxWidth: '100%', overflow: 'auto'}}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Text size={2} weight="semibold">
            Merch line items — {rows.length} of {allRows.length}
          </Text>
          <Flex gap={2} align="center" wrap="wrap">
            <TextInput
              placeholder="Search customer, item, size…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
              <option value="all">All statuses</option>
              <option value="unfulfilled">Unfulfilled</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Button text="Download CSV" mode="ghost" onClick={() => downloadCsv(rows)} disabled={!rows.length} />
          </Flex>
        </Flex>

        <Card radius={2} shadow={1} overflow="auto">
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
            <thead>
              <tr>
                {['Date', 'Customer', 'Type', 'Item', 'Size', 'Qty', 'Fulfillment', ''].map((h) => (
                  <th key={h || 'actions'} style={{...cellStyle, textAlign: 'left'}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={cellStyle}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US') : '—'}
                  </td>
                  <td style={cellStyle}>{r.customerName}</td>
                  <td style={cellStyle}>{r.orderType}</td>
                  <td style={cellStyle}>{r.item}</td>
                  <td style={{...cellStyle, fontWeight: 600}}>{r.size || '—'}</td>
                  <td style={cellStyle}>{r.qty}</td>
                  <td style={cellStyle}>{r.fulfillmentStatus}</td>
                  <td style={cellStyle}>
                    <IntentLink intent="edit" params={{id: r.orderId, type: 'order'}}>
                      Open →
                    </IntentLink>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} style={{...cellStyle, textAlign: 'center', opacity: 0.6}}>
                    No matching line items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Stack>
    </Box>
  )
}
