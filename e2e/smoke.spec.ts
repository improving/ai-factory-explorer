import { expect, test, type Page } from '@playwright/test'
import { ncclSample } from '../src/collectives/ncclSample'
import { GUIDES } from '../src/guides/guides'

// The file that a reader opens: no server, no network.
const APP = new URL('../dist/index.html', import.meta.url).href

// The contract is 3 s. A shared two-core CI runner renders the same graph slower than a laptop, so the bound
// there is 4 s: the number is a limit on a regression, not a benchmark of the hardware.
const RENDER_MS = process.env.CI ? 4000 : 3000

// The app makes no request of its own: a request that leaves the artifact is a failure.
async function watchRemote(page: Page) {
  const remote: string[] = []
  await page.route(/^https?:\/\//, (route) => {
    remote.push(route.request().url())
    return route.abort()
  })
  return remote
}

async function open(page: Page, hash = '') {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  const remote = await watchRemote(page)
  await page.goto(`${APP}${hash}`)
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-element-count', /^[1-9]\d*$/)
  return { errors, remote }
}

test('opens offline with the 1 SU default', async ({ page }) => {
  const { errors, remote } = await open(page)
  await expect(page.getByTestId('numbers')).toContainText('576 GPUs')
  await expect(page.getByTestId('numbers')).toContainText('✓ RA')
  expect(remote).toEqual([])
  expect(errors).toEqual([])
})

test('the SU count sets the switch counts of the RA row', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('cfg-suCount').selectOption('4')
  await expect(page.getByTestId('numbers')).toContainText('18 spines')
  await expect(page.getByTestId('numbers')).toContainText('2304 node-leaf cables')
  await expect(page).toHaveURL(/su=4/)
  expect(errors).toEqual([])
})

test('a server link opens the node view, and Esc goes back', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05')
  await expect(page.getByTestId('breadcrumb')).toContainText('su1-n05')
  expect(Number(await page.getByTestId('canvas').getAttribute('data-element-count'))).toBe(116)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('breadcrumb')).not.toContainText('su1-n05')
  expect(errors).toEqual([])
})

test('the inspector shows a leaf and reads its runbook in the Library', async ({ page }) => {
  const { errors } = await open(page, '#su=1&sel=su1-leaf-r3')
  await expect(page.getByTestId('inspector-title')).toContainText('rail 3')
  await page.getByRole('tab', { name: 'Learn' }).click()
  const ref = page.getByRole('button', { name: /^N1:/ })
  await expect(ref).toHaveAttribute('title', /Open in the Library: Runbook catalogue/)
  await ref.click()
  await expect(page.getByTestId('lib-title')).toHaveText('Runbook catalogue')
  await expect(page).toHaveURL(/mode=library&doc=hb-runbook-catalogue/)
  expect(errors).toEqual([])
})

test('a bad link falls back to the defaults', async ({ page }) => {
  const { errors } = await open(page, '#su=3&platform=h999&rail=9&server=su9-n99')
  await expect(page.getByTestId('numbers')).toContainText('576 GPUs')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory › Pod')
  expect(errors).toEqual([])
})

test('8 SU with all SUs open renders in less than 3 s', async ({ page }) => {
  const { errors } = await open(page, '#su=8')
  const canvas = page.getByTestId('canvas')
  await expect(canvas).not.toHaveAttribute('data-render-seq', '0')
  const before = await canvas.getAttribute('data-render-seq')
  await page.getByRole('button', { name: 'Expand all SUs' }).click()
  await expect(canvas).not.toHaveAttribute('data-render-seq', before!)
  expect(Number(await canvas.getAttribute('data-element-count'))).toBeGreaterThan(7000)
  expect(Number(await canvas.getAttribute('data-render-ms'))).toBeLessThan(RENDER_MS)
  expect(errors).toEqual([])
})

test('Expand all is off above 8 SU', async ({ page }) => {
  await open(page, '#su=18')
  await expect(page.getByRole('button', { name: 'Expand all SUs' })).toBeDisabled()
})

test('a hash change on the same page (address bar, Back) updates the view', async ({ page }) => {
  const { errors } = await open(page, '#su=1')
  await page.evaluate(() => {
    location.hash = '#su=4&server=su3-n07'
  })
  await expect(page.getByTestId('numbers')).toContainText('18 spines')
  await expect(page.getByTestId('breadcrumb')).toContainText('su3-n07')
  await page.goBack()
  await expect(page.getByTestId('numbers')).toContainText('4 spines')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory › Pod')
  expect(errors).toEqual([])
})

test('a selected leaf keeps its links in focus and fades the rest', async ({ page }) => {
  const { errors } = await open(page, '#su=1&open=1&sel=su1-leaf-r3')
  const canvas = page.getByTestId('canvas')
  // the leaf, its 72 cables and 72 servers, its 4 uplink bundles and 4 spines, and the open SU around the servers
  await expect(canvas).toHaveAttribute('data-focus-count', '154')
  const total = Number(await canvas.getAttribute('data-element-count'))
  await expect(canvas).toHaveAttribute('data-faded-count', String(total - 154))
  expect(errors).toEqual([])
})

test('a selected GPU keeps its NVLink and its NIC in focus', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05/gpu6')
  // GPU 6, 2 NVLink edges, 2 NVSwitch chips, the PCIe edge, NIC 6, and the driver with its link
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-focus-count', '9')
  expect(errors).toEqual([])
})

test('clearing the selection removes the focus, the fade, and the pulse', async ({ page }) => {
  const { errors } = await open(page, '#su=1&sel=su1-leaf-r3')
  const canvas = page.getByTestId('canvas')
  await expect(canvas).not.toHaveAttribute('data-focus-count', '0')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-focus-count', '0')
  await expect(canvas).toHaveAttribute('data-faded-count', '0')
  await expect(canvas).toHaveAttribute('data-pulse', 'off')
  expect(errors).toEqual([])
})

test('a selected cable keeps only its two ends in focus', async ({ page }) => {
  const { errors } = await open(page, '#su=1&open=1&sel=su1-n10~r5')
  // the cable, server su1-n10, the rail 5 leaf, and the open SU around the server
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-focus-count', '4')
  expect(errors).toEqual([])
})

const DESIGN_CASES: [string, string[]][] = [
  ['#platform=b300&fabric=spectrum-x&design=b300-spx&planes=dual&su=4', ['256 servers', '64 leaves', '32 spines', '4096 node-leaf cables', '✓ RA']],
  ['#platform=b300&build=oem-hgx&fabric=spectrum-x&design=ent-b300&planes=dual&su=8', ['32 nodes', '8 leaves', '4 spines', '✓ RA']],
  ['#platform=h100&su=4', ['128 nodes', '1024 GPUs', '32 leaves', '16 spines', '✓ RA']],
  ['#platform=b200&su=1', ['31 nodes', '248 GPUs', '8 leaves', '✓ RA']],
  ['#platform=gb300-nvl72&su=2', ['288 trays', '1152 GPUs', '16 leaves', '8 spines', '✓ RA']],
  ['#platform=gb200-nvl72', ['18 trays', '72 GPUs', 'one rack, no scale-out fabric']],
]

for (const [hash, texts] of DESIGN_CASES) {
  test(`opens ${hash} with the counts of its RA`, async ({ page }) => {
    const { errors } = await open(page, hash)
    for (const t of texts) await expect(page.getByTestId('numbers')).toContainText(t)
    expect(errors).toEqual([])
  })
}

test('the preset menu switches the whole configuration', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('cfg-preset').selectOption('superpod-h100')
  await expect(page.getByTestId('numbers')).toContainText('32 leaves')
  await expect(page).toHaveURL(/design=ndr-h100/)
  expect(errors).toEqual([])
})

test('a platform change repairs the other switches', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('cfg-platform').selectOption('gb300-nvl72')
  await expect(page.getByTestId('numbers')).toContainText('288 trays')
  await expect(page).toHaveURL(/design=gb300-xdr/)
  expect(errors).toEqual([])
})

test('a GB200 tray opens its rack view in less than 3 s', async ({ page }) => {
  const { errors } = await open(page, '#platform=gb200-nvl72&server=su1-n05')
  const canvas = page.getByTestId('canvas')
  await expect(page.getByTestId('breadcrumb')).toContainText('Rack 1')
  await expect(canvas).toHaveAttribute('data-element-count', '1773')
  await expect(canvas).not.toHaveAttribute('data-render-seq', '0')
  expect(Number(await canvas.getAttribute('data-render-ms'))).toBeLessThan(RENDER_MS)
  expect(errors).toEqual([])
})

test('a selected NVL72 GPU keeps its 18 NVLink links in focus', async ({ page }) => {
  const { errors } = await open(page, '#platform=gb300-nvl72&su=2&server=su1-n05&sel=su1-n05%2Fgpu1')
  // The GPU, its 18 NVLink links and chips, its C2C link and Grace CPU, its PCIe link and NIC (41),
  // and the parents: the tray, the rack, and the 9 switch trays (11).
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-focus-count', '52')
  expect(errors).toEqual([])
})

test('top-of-rack shows that it is an illustration', async ({ page }) => {
  const { errors } = await open(page, '#topology=tor')
  await expect(page.getByTestId('numbers')).toContainText('illustration')
  expect(errors).toEqual([])
})

test('a rail key in the NVL72 rack view keeps the trays and the rack lit', async ({ page }) => {
  const { errors } = await open(page, '#platform=gb200-nvl72&server=su1-n05')
  await page.keyboard.press('2')
  // GPU 2 and NIC 2 of the 18 trays (36), and their parents: the 18 trays and the rack (19).
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-rail-lit', '55')
  await page.keyboard.press('2')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-rail-lit', '0')
  expect(errors).toEqual([])
})

test('the factory overview shows every network as a block, under 100 elements', async ({ page }) => {
  const { errors } = await open(page, '#view=overview')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-element-count', '45')
  expect(errors).toEqual([])
})

test('a factory block shows its facts and its runbooks', async ({ page }) => {
  const { errors } = await open(page, '#view=overview&sel=blk-vast')
  await expect(page.getByTestId('inspector-title')).toContainText('VAST')
  await page.getByRole('tab', { name: 'Learn' }).click()
  const ref = page.getByRole('button', { name: /^V1:/ })
  await ref.click()
  await expect(page.getByTestId('lib-title')).toHaveText('Runbook catalogue')
  expect(errors).toEqual([])
})

test('Slurm only has no Rafay controller to select', async ({ page }) => {
  const { errors } = await open(page, '#view=overview&orchestration=slurm&sel=blk-rafay')
  await expect(page.getByTestId('inspector-title')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('GB300 is liquid-cooled, so the overview has a CDU', async ({ page }) => {
  const { errors } = await open(page, '#view=overview&platform=gb300-nvl72&sel=blk-cdu')
  await expect(page.getByTestId('inspector-title')).toContainText('CDU')
  expect(errors).toEqual([])
})

test('empty racks in the last SU keep the RA check', async ({ page }) => {
  const { errors } = await open(page, '#lastSuEmpty=36')
  await expect(page.getByTestId('numbers')).toContainText('36 servers')
  await expect(page.getByTestId('numbers')).toContainText('✓ RA')
  await expect(page.getByTestId('numbers')).toContainText('empty slots')
  expect(errors).toEqual([])
})

test('Esc in an empty fabric goes up to the factory overview', async ({ page }) => {
  const { errors } = await open(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory')
  expect(errors).toEqual([])
})

test('the inspector of an SU opens its racks', async ({ page }) => {
  const { errors } = await open(page, '#sel=su1')
  await page.getByTestId('show-racks').click()
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory › Pod › SU 1 racks')
  await expect(page.getByTestId('face-front')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('a rack shows its ports and a port map that downloads as CSV', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-k1&face=front')
  await expect(page.getByTestId('breadcrumb')).toContainText('SU 1 rack 1')
  await expect(page.getByTestId('portmap')).toContainText('Port map: 32 cables')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('portmap-csv').click()])
  expect(download.suggestedFilename()).toBe('port-map-su1-k1.csv')
  expect(errors).toEqual([])
})

test('a port shows the far end of its cable', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-k1&face=front&sel=su1-n01%2Fport-c3')
  await expect(page.getByTestId('inspector-title')).toHaveText('su1-n01 OSFP 4')
  await expect(page.locator('.specs')).toContainText('su1-leaf-r3 sw1p1')
  expect(errors).toEqual([])
})

test('a DGX H100 rack opens on the rear, where its ports are', async ({ page }) => {
  const { errors } = await open(page, '#platform=h100&su=4&racks=1&rack=su1-k1')
  await expect(page.getByTestId('face-rear')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('a GB200 rack has no fabric cable in its port map', async ({ page }) => {
  const { errors } = await open(page, '#platform=gb200-nvl72&racks=1&rack=su1-k1&face=front')
  await expect(page.getByTestId('portmap')).toContainText('No compute fabric cable')
  expect(errors).toEqual([])
})

test('a rack link of an SU that the configuration does not have opens the fabric', async ({ page }) => {
  const { errors } = await open(page, '#racks=9&rack=su9-k1&face=rear')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory › Pod')
  expect(errors).toEqual([])
})

test('Esc goes up from a rack to the racks, then to the fabric', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-net1&face=front')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory › Pod › SU 1 racks')
  await page.keyboard.press('Escape') // clears the selection of the rack
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('breadcrumb')).toHaveText('Factory › Pod')
  expect(errors).toEqual([])
})

test('the ownership overlay colours the overview and shows its legend', async ({ page }) => {
  const { errors } = await open(page, '#view=overview&color=owner')
  await expect(page.getByTestId('overlay-legend')).toContainText('Enterprise network team')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-overlay-lit', '21')
  expect(errors).toEqual([])
})

test('the node-state overlay colours the servers of an open SU, with counts', async ({ page }) => {
  const { errors } = await open(page, '#open=1&color=state')
  await expect(page.getByTestId('overlay-legend')).toContainText('degraded: 1')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-overlay-lit', '72')
  expect(errors).toEqual([])
})

test('a config change with an overlay on colours the new servers only', async ({ page }) => {
  const { errors } = await open(page, '#open=1&color=state')
  await page.getByTestId('cfg-platform').selectOption('gb200-nvl72')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-overlay-lit', '18')
  expect(errors).toEqual([])
})

test('a view change keeps the colour overlay', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&face=front&color=tenant')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-overlay-lit', '72')
  await expect(page.getByTestId('overlay-legend')).toContainText('UAT: 4')
  expect(errors).toEqual([])
})

test('the colour overlay switch changes the overlay', async ({ page }) => {
  const { errors } = await open(page, '#view=overview')
  await page.getByText('Overlays', { exact: true }).click()
  await page.getByTestId('overlay-color').selectOption('owner')
  await expect(page.getByTestId('overlay-legend')).toBeVisible()
  expect(errors).toEqual([])
})

test('a hidden layer hides its links and stays hidden after a reload', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05&hide=pcie')
  await expect(page.getByTestId('canvas')).not.toHaveAttribute('data-off-count', '0')
  await page.reload()
  await expect(page.getByTestId('canvas')).not.toHaveAttribute('data-off-count', '0')
  expect(errors).toEqual([])
})

test('the telemetry overlay adds the monitoring chain to the overview', async ({ page }) => {
  const { errors } = await open(page, '#view=overview&telemetry=1&sel=blk-itsm')
  await expect(page.getByTestId('inspector-title')).toContainText('ServiceNow')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-element-count', String(45 + 4 + 8))
  expect(errors).toEqual([])
})

test('the Owner/Tool tab gives the owner, the tools, and who operates them', async ({ page }) => {
  const { errors } = await open(page, '#sel=su1-leaf-r0')
  await page.getByRole('tab', { name: 'Owner/Tool' }).click()
  await expect(page.locator('.specs')).toContainText('UFM and switch telemetry')
  await expect(page.locator('.specs')).toContainText('L2 reads')
  expect(errors).toEqual([])
})

test('the Lifecycle tab shows the state, the verdict, and the gate', async ({ page }) => {
  const { errors } = await open(page, '#su=1&sel=su1-n71')
  await expect(page.getByTestId('inspector-title')).toContainText('su1-n71')
  await page.getByRole('tab', { name: 'Lifecycle' }).click()
  await expect(page.getByTestId('lifecycle-state')).toContainText('Quarantined')
  await expect(page.getByTestId('verdict-severity')).toContainText('CRITICAL')
  await expect(page.getByTestId('lifecycle-panel')).toContainText('Prevent allocations')
  await expect(page.getByRole('button', { name: 'RB-12' })).toHaveAttribute('title', /Open in the Library: Host not allocatable/)
  expect(errors).toEqual([])
})

test('the Lifecycle tab shows only for a host', async ({ page }) => {
  const { errors } = await open(page, '#sel=su1-n71')
  await expect(page.getByRole('tab', { name: 'Lifecycle' })).toHaveCount(1)
  await page.evaluate(() => (location.hash = '#server=su1-n71&sel=su1-n71/gpu2'))
  await expect(page.getByRole('tab', { name: 'Lifecycle' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Owner/Tool' })).toHaveCount(1)
  // A link that names the tab of a part that has none opens the first tab.
  await page.evaluate(() => (location.hash = '#sel=su1-leaf-r3&itab=lifecycle'))
  await expect(page.getByRole('tab', { name: 'Specs' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Lifecycle' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the Lifecycle and Health overlays colour the hosts and show the legend', async ({ page }) => {
  const { errors } = await open(page, '#su=1')
  await page.getByText('Overlays', { exact: true }).click()
  await page.getByTestId('overlay-color').selectOption('lifecycle')
  await expect(page.getByTestId('overlay-legend')).toContainText('Quarantined: 1')
  await page.getByTestId('overlay-color').selectOption('health')
  await expect(page.getByTestId('overlay-legend')).toContainText('Critical: 1')
  expect(errors).toEqual([])
})

test('Schedule mode places a job and shows the decision path', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule')
  await expect(page.getByTestId('schedbar')).toBeVisible()
  await expect(page.getByTestId('sched-result')).toContainText('Placed 32 GPUs')
  await expect(page.getByTestId('sched-step-queue')).toContainText('Queue limit')
  await expect(page.getByTestId('sched-step-placement')).toContainText('Placement')
  expect(Number(await page.getByTestId('canvas').getAttribute('data-sched-ok'))).toBe(4)
  expect(errors).toEqual([])
})

test('Schedule mode says why a job is pending', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule&sc=team-a.500.build.all.any.rack.1')
  await expect(page.getByTestId('sched-result')).toContainText('Pending: Team A has a limit of 403')
  await expect(page.getByTestId('sched-step-queue')).toHaveClass(/blocked/)
  expect(errors).toEqual([])
})

test('a non-preemptible job over the quota is blocked, and a preemptible one is not', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule&sc=team-a.400.build.all.any.rack.1')
  await expect(page.getByTestId('sched-result')).toContainText('Non-preemptible work stays in quota')
  await page.getByTestId('sched-priority').selectOption('train')
  await expect(page.getByTestId('sched-result')).toContainText('Pending: Only 280 GPUs are free')
  expect(errors).toEqual([])
})

test('a topology requirement blocks a job that no node can hold', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule&sc=team-a.16.build.all.node.rack.1')
  await expect(page.getByTestId('sched-result')).toContainText('No one node has 16 free GPUs')
  expect(errors).toEqual([])
})

test('a job splits into segments, each in its own rack', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule&sc=team-a.32.build.all.rack.rack.2')
  await expect(page.getByTestId('sched-result')).toContainText('Placed 32 GPUs')
  await expect(page.getByTestId('sched-panel')).toContainText('Segment 1: 16 GPUs')
  await expect(page.getByTestId('sched-panel')).toContainText('Segment 2: 16 GPUs')
  expect(errors).toEqual([])
})

test('the firmware of a host shows the component that is behind the baseline', async ({ page }) => {
  const { errors } = await open(page, '#sel=su1-n05&itab=lifecycle')
  await expect(page.getByTestId('firmware-summary')).toContainText('behind the baseline on the gpu driver')
  await expect(page.getByTestId('firmware-driver')).toContainText('570')
  await expect(page.getByTestId('firmware-driver')).toContainText('569')
  await expect(page.getByTestId('firmware-driver')).toContainText('behind')
  await expect(page.getByTestId('firmware-cuda')).toContainText('12.8')
  await expect(page.getByTestId('firmware-cuda')).toContainText('match')
  await expect(page.getByTestId('firmware-fleet')).toContainText('2: su1-n05, su1-n56')
  await expect(page.getByTestId('firmware-fleet')).toContainText('none')
  await expect(page.getByTestId('firmware-model')).toContainText('one host of every sixteen')
  expect(errors).toEqual([])
})

test('a host that matches the firmware baseline says so', async ({ page }) => {
  const { errors } = await open(page, '#sel=su1-n01&itab=lifecycle')
  await expect(page.getByTestId('firmware-summary')).toContainText('matches the baseline on every component')
  for (const id of ['uefi', 'driver', 'cuda', 'fm', 'nic', 'nvswitch']) await expect(page.getByTestId(`firmware-${id}`)).toContainText('match')
  expect(errors).toEqual([])
})

test('the keyboard reaches the canvas, moves the ring, and opens a part', async ({ page }) => {
  const { errors } = await open(page, '#open=1')
  await page.getByText('Go to the canvas').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-kb-ring', 'spine-01')
  await expect(page.getByTestId('kb-announce')).toHaveText('Spine 1, a spine, 1 of 85')
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-kb-ring', 'spine-02')
  await expect(page.getByTestId('kb-announce')).toHaveText('Spine 2, a spine, 2 of 85')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('inspector-title')).toHaveText('Spine 2')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-kb-ring', 'spine-01')
  // The Tab before the first part leaves the canvas, and the ring goes.
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-kb-ring', '')
  await expect(page.getByTestId('canvas')).not.toBeFocused()
  expect(errors).toEqual([])
})

test('the time view colours the fleet at the cursor, and the history of a host follows it', async ({ page }) => {
  const { errors } = await open(page, '#tw=7d&t=3045&color=state&open=1&sel=su1-n05&itab=lifecycle')
  await expect(page.getByTestId('timebar')).toBeVisible()
  await expect(page.getByTestId('time-clock')).toHaveText('day 3, 02:45')
  await expect(page.getByTestId('time-status')).toContainText('419 events in the window')
  await expect(page.getByTestId('lifecycle-state')).toContainText('In repair or maintenance')
  await expect(page.getByTestId('lifecycle-history')).toContainText('drained for the firmware window')
  await expect(page.getByTestId('lifecycle-at')).toContainText('1 of them are later')
  // The legend counts the fleet at the cursor: the firmware window has 42 hosts in maintenance.
  await expect(page.getByTestId('overlay-legend')).toContainText('maintenance: 42')
  // Another minute of the same day: this host is back in the pool, and both events are behind the cursor.
  await page.getByTestId('time-cursor').fill('3100')
  await expect(page.getByTestId('time-clock')).toHaveText('day 3, 03:40')
  await expect(page.getByTestId('lifecycle-state')).toContainText('In use')
  await expect(page.getByTestId('lifecycle-at')).toContainText('0 of them are later')
  await expect(page.getByTestId('overlay-legend')).toContainText('maintenance: 1') // only the host that the configuration puts there
  expect(errors).toEqual([])
})

test('the time view switches its window, and the Overlays panel turns it on', async ({ page }) => {
  const { errors } = await open(page, '#color=state')
  await expect(page.getByTestId('timebar')).toHaveCount(0)
  await page.getByText('Overlays', { exact: true }).click() // the section starts closed
  await page.getByTestId('overlay-time').check()
  await expect(page.getByTestId('timebar')).toBeVisible()
  await expect(page).toHaveURL(/tw=24h/)
  await expect(page.getByTestId('time-clock')).toHaveText('day 7, 23:59')
  await expect(page.getByTestId('time-now')).toBeDisabled() // the window ends now
  await page.getByTestId('time-window-7d').click()
  await expect(page).toHaveURL(/tw=7d/)
  await expect(page.getByTestId('time-clock')).toHaveText('day 7, 23:59')
  await expect(page.getByTestId('time-status')).toContainText('419 events in the window')
  await page.getByTestId('time-cursor').fill('0')
  await expect(page.getByTestId('time-clock')).toHaveText('day 1, 00:00')
  await expect(page).toHaveURL(/t=0/)
  await page.getByTestId('time-now').click()
  await expect(page.getByTestId('time-clock')).toHaveText('day 7, 23:59')
  await expect(page).not.toHaveURL(/t=/)
  await page.getByTestId('overlay-time').uncheck()
  await expect(page.getByTestId('timebar')).toHaveCount(0)
  await expect(page).not.toHaveURL(/tw=/)
  expect(errors).toEqual([])
})

test('the load view runs the fleet, and the seed changes the run', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule&open=1&sc=team-a.32.build.all.any.rack.1&sv=load&lt=1500')
  await expect(page.getByTestId('load-panel')).toBeVisible()
  await expect(page.getByTestId('load-clock')).toHaveText('25:00')
  await expect(page.getByTestId('load-numbers')).toContainText('35,232')
  await expect(page.getByTestId('load-numbers')).toContainText('128')
  await expect(page.getByTestId('scale-strip')).toBeVisible()
  await expect(page.getByTestId('scale-strip')).toContainText('1,152 racks')
  await expect(page.getByTestId('load-queue-team-a')).toContainText('25,805') // the limit of 70 % of 36,864 GPUs
  // Play moves the cursor, and Pause stops it.
  await page.getByTestId('load-cursor').fill('0')
  await expect(page.getByTestId('load-clock')).toHaveText('00:00')
  await page.getByTestId('load-play').click()
  await page.waitForTimeout(700)
  await page.getByTestId('load-play').click()
  await expect(page.getByTestId('load-clock')).not.toHaveText('00:00')
  // Another seed gives another run: the same link is not the same numbers.
  await page.getByTestId('load-seed').fill('8')
  await expect(page.getByTestId('load-numbers')).not.toContainText('35,232')
  expect(errors).toEqual([])
})

test('the Decision and Load views of Schedule mode share one mode', async ({ page }) => {
  const { errors } = await open(page, '#mode=schedule&sc=team-a.32.build.all.any.rack.1')
  await expect(page.getByTestId('sched-panel')).toBeVisible()
  await page.getByTestId('sched-view-load').click()
  await expect(page.getByTestId('load-panel')).toBeVisible()
  await expect(page.getByTestId('sched-panel')).toHaveCount(0)
  await expect(page).toHaveURL(/sv=load/)
  await page.getByTestId('sched-view-decision').click()
  await expect(page.getByTestId('sched-panel')).toBeVisible()
  await expect(page.getByTestId('load-panel')).toHaveCount(0)
  await expect(page).not.toHaveURL(/sv=load/)
  expect(errors).toEqual([])
})

test('a colour overlay change keeps the selection focus and the rail highlight on the canvas', async ({ page }) => {
  const { errors } = await open(page, '#open=1&sel=su1-n05&rail=2')
  // The classes on the Cytoscape elements, not the dataset counters, which an effect that did not run leaves stale.
  const classes = () =>
    page.evaluate(() => {
      const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: { $: (s: string) => { length: number } } } })._cyreg.cy
      return { focus: cy.$('.focus').length, selected: cy.$(':selected').length, hl: cy.$('.hl').length }
    })
  const before = await classes()
  expect(before.focus).toBeGreaterThan(0)
  await page.getByText('Overlays', { exact: true }).click()
  await page.getByTestId('overlay-color').selectOption('state')
  await expect(page.getByTestId('overlay-legend')).toBeVisible()
  await expect.poll(classes).toEqual(before)
  await page.getByTestId('overlay-color').selectOption('none')
  await expect.poll(classes).toEqual(before)
  expect(errors).toEqual([])
})

test('a node service shows its fact and its runbooks', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05&sel=su1-n05%2Fsvc-fabric-manager')
  await expect(page.getByTestId('inspector-title')).toContainText('Fabric Manager')
  await expect(page.locator('.specs')).toContainText('NVSwitch memory fabrics')
  await page.getByRole('tab', { name: 'Learn' }).click()
  await expect(page.getByRole('button', { name: /^G7:/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('the Node services layer hides the service links, also for a selected service', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05&hide=services&sel=su1-n05%2Fsvc-driver')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-off-count', '16')
  expect(errors).toEqual([])
})

test('the topo -m button opens the matrix, and a cell lights its two parts', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05')
  await page.getByTestId('topo-toggle').click()
  await expect(page.getByTestId('topo')).toBeVisible()
  await expect(page).toHaveURL(/topo=1/)
  await page.getByTestId('topo-GPU0-NIC0').click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '2')
  await page.getByTestId('topo-GPU0-NIC0').click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '0')
  expect(errors).toEqual([])
})

test('a view change clears the pair highlight of the matrix', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05&topo=1')
  await page.getByTestId('topo-GPU0-NIC4').click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '2')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('topo')).toHaveCount(0)
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '0')
  expect(errors).toEqual([])
})

test('the matrix follows the platform: NV? for the H100, none for an NVL72 tray', async ({ page }) => {
  const { errors } = await open(page, '#platform=h100&server=su1-n05&topo=1')
  await expect(page.getByTestId('topo-GPU0-GPU1')).toHaveText('NV?')
  await page.getByTestId('cfg-platform').selectOption('gb200-nvl72')
  await expect(page.getByTestId('topo')).toHaveCount(0)
  await expect(page.getByTestId('topo-toggle')).toHaveCount(0)
  expect(errors).toEqual([])
})

// The classes of two parts and the focus count, from the Cytoscape instance.
async function pairState(page: Page, a: string, b: string) {
  return page.evaluate(
    ({ a, b }) => {
      const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
      const faded = (id: string) => ['faded', 'dim', 'pair-off'].some((c) => cy.getElementById(id).hasClass(c))
      return { aFaded: faded(a), bFaded: faded(b), focus: cy.$('.focus').length }
    },
    { a, b },
  )
}

test('a cell click after a selection lights its two parts, not the selection', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05&topo=1&sel=su1-n05%2Fgpu5&rail=3')
  await page.getByTestId('topo-GPU0-NIC0').click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '2')
  await expect.poll(() => pairState(page, 'su1-n05/gpu0', 'su1-n05/nic0')).toEqual({ aFaded: false, bFaded: false, focus: 0 })
  expect(errors).toEqual([])
})

test('a selection after a cell click clears the pair highlight', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05&topo=1')
  await page.getByTestId('topo-GPU0-NIC0').click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '2')
  await page.evaluate(() => {
    location.hash = `${location.hash}&sel=su1-n05%2Fgpu3`
  })
  await expect(page.getByTestId('inspector-title')).toContainText('GPU 3')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-pair-lit', '0')
  await expect(page.getByTestId('topo-GPU0-NIC0')).not.toHaveClass(/\bon\b/)
  expect(errors).toEqual([])
})

// Emits a tap on one canvas element, as a click on it would.
async function tap(page: Page, id: string) {
  await page.evaluate((id) => {
    const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
    cy.getElementById(id).emit('tap')
  }, id)
}

test('a scenario opens its trace: the strip, the hop table, and the bottleneck', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-trace').click()
  await page.getByTestId('trace-scenario').selectOption('pxn')
  await expect(page.getByTestId('hop-table')).toBeVisible()
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(6)
  await expect(page.getByTestId('hop-row-3')).toContainText('(bottleneck)')
  await expect(page.getByTestId('breadcrumb')).toContainText('Trace: su1-n05/gpu2 → su1-n40/gpu5')
  await expect(page).toHaveURL(/view=trace/)
  expect(errors).toEqual([])
})

test('Next, Back, and the arrow keys step through the hops', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const canvas = page.getByTestId('canvas')
  await expect(canvas).toHaveAttribute('data-hop-on', '0')
  await page.getByTestId('trace-next').click()
  await expect(canvas).toHaveAttribute('data-hop-on', '1')
  await page.keyboard.press('ArrowRight')
  await expect(canvas).toHaveAttribute('data-hop-on', '2')
  await expect(page.getByTestId('hop-row-2')).toHaveClass(/on/)
  await page.getByTestId('trace-back').click()
  await expect(canvas).toHaveAttribute('data-hop-on', '1')
  expect(errors).toEqual([])
})

test('PXN off takes a spine, PXN on does not', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&view=trace')
  await expect(page.getByTestId('hop-table')).not.toContainText('Spine')
  await page.getByTestId('trace-pxn').uncheck()
  await expect(page.getByTestId('hop-table')).toContainText('Spine 1 (1 of 4)')
  expect(errors).toEqual([])
})

test('two GPU clicks in Trace mode open the trace view', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05')
  await page.getByTestId('mode-trace').click()
  await tap(page, 'su1-n05/gpu2')
  await expect(page.getByTestId('trace-status')).toContainText('Source: su1-n05/gpu2')
  await tap(page, 'su1-n05/gpu5')
  await expect(page.getByTestId('breadcrumb')).toContainText('Trace: su1-n05/gpu2 → su1-n05/gpu5')
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('a part of the strip shows its specs, and Esc goes to the node view of the source', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu1,su1-n12/gpu2&platform=gb300-nvl72&su=2&view=trace')
  await tap(page, 'su1-k1-sw1/chip0')
  await expect(page.getByTestId('inspector-title')).toContainText('NVSwitch 1.0')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('breadcrumb')).toContainText('su1-n05')
  expect(errors).toEqual([])
})

test('a configuration change that removes a GPU of the trace clears it', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-trace').click()
  await page.getByTestId('trace-scenario').selectOption('cross-su')
  await expect(page.getByTestId('hop-table')).toBeVisible()
  await page.getByTestId('cfg-suCount').selectOption('1')
  await expect(page.getByTestId('hop-table')).toHaveCount(0)
  await expect(page.getByTestId('trace-status')).toContainText('Click a source GPU')
  expect(errors).toEqual([])
})

test('the trace view fits again after a configuration change', async ({ page }) => {
  const { errors } = await open(page, '#topology=tor&mode=trace&trace=su1-n01/gpu0,su1-n05/gpu7&pxn=0&view=trace')
  await page.getByTestId('cfg-topology').selectOption('rail')
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(6)
  const inside = () =>
    page.evaluate(() => {
      const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
      const ext = cy.extent()
      return cy.nodes('.trace-part').every((n: any) => {
        const p = n.position()
        return p.x >= ext.x1 && p.x <= ext.x2 && p.y >= ext.y1 && p.y <= ext.y2
      })
    })
  await expect.poll(inside).toBe(true)
  expect(errors).toEqual([])
})

test('the trace bar shows its status, and the canvas starts below the bar, also when it wraps', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { errors } = await open(page, '#server=su1-n05&color=state&mode=trace')
  await tap(page, 'su1-n05/gpu2')
  await expect(page.getByTestId('trace-status')).toContainText('Click a destination GPU')
  const bar = (await page.getByTestId('tracebar').boundingBox())!
  const status = (await page.getByTestId('trace-status').boundingBox())!
  const canvas = (await page.getByTestId('canvas').boundingBox())!
  expect(status.y + status.height).toBeLessThanOrEqual(bar.y + bar.height + 1)
  expect(canvas.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  expect(errors).toEqual([])
})

test('the NVLink hop says that the NVSwitch chips work in parallel', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu1,su1-n12/gpu2&platform=gb300-nvl72&su=2&view=trace')
  await expect(page.getByTestId('hop-row-0')).toContainText('18 chips in parallel')
  expect(errors).toEqual([])
})

test('a factory row opens its path: the dashed path-only parts and the title', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-trace').click()
  await page.getByTestId('trace-scenario').selectOption('user-ui')
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(5)
  await expect(page.getByTestId('breadcrumb')).toContainText('Trace: User to the Rafay controller')
  await tap(page, 'path-user')
  await expect(page.getByTestId('inspector-title')).toHaveText('User (the UI or the API)')
  expect(errors).toEqual([])
})

test('GPU to VAST: GDS off adds the bounce buffer in CPU memory', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2&path=storage&view=trace')
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(4)
  await page.locator('details.section summary', { hasText: 'Storage' }).click() // the Storage section starts closed
  await page.getByTestId('cfg-gds').selectOption('off')
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(5)
  await expect(page.getByTestId('hop-table')).toContainText('bounce buffer')
  // The new path fits again: the last part is in the viewport.
  const inside = () =>
    page.evaluate(() => {
      const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
      const ext = cy.extent()
      const p = cy.getElementById('path-dnode').position()
      return p.x >= ext.x1 && p.x <= ext.x2 && p.y >= ext.y1 && p.y <= ext.y2
    })
  await expect.poll(inside).toBe(true)
  expect(errors).toEqual([])
})

test('To VAST traces the storage path of a picked GPU', async ({ page }) => {
  const { errors } = await open(page, '#server=su1-n05')
  await page.getByTestId('mode-trace').click()
  await tap(page, 'su1-n05/gpu2')
  await page.getByTestId('trace-to-vast').click()
  await expect(page.getByTestId('breadcrumb')).toContainText('Trace: GPU to VAST')
  await expect(page.locator('[data-testid^="hop-row-"]')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('a telemetry block of a factory path shows its specs in the trace view', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2&path=telemetry-itsm&view=trace')
  await tap(page, 'blk-prometheus')
  await expect(page.getByTestId('inspector-title')).toContainText('Prometheus')
  await expect(page.getByTestId('hop-table')).toContainText('L1 opens the ticket by hand')
  expect(errors).toEqual([])
})

test('a factory path that the configuration does not have says why', async ({ page }) => {
  // Not open(): with no path, the canvas has 0 elements.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${APP}#fabric=spectrum-x&planes=dual&su=4&mode=trace&trace=su1-n05/gpu2&path=control-sm&view=trace`)
  await expect(page.getByTestId('trace-status')).toContainText('no InfiniBand subnet manager')
  await expect(page.getByTestId('hop-table')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a library scenario fails a part and shows its impact', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-simulate').click()
  await page.getByTestId('sim-scenario').selectOption('leaf-single')
  await expect(page.getByTestId('impact')).toContainText('P2')
  await expect(page.getByTestId('impact')).toContainText('73 alerts → 1 incident')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-failed-count', '1')
  await expect(page.getByTestId('canvas')).not.toHaveAttribute('data-hit-count', '0')
  await expect(page).toHaveURL(/fail=su1-leaf-r3/)
  expect(errors).toEqual([])
})

test('a scenario with steps: Next and Back change the failures, and the story shows', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-simulate').click()
  await page.getByTestId('sim-scenario').selectOption('os-patch')
  await expect(page.getByTestId('sim-story')).toContainText('Count the failures')
  await expect(page.getByTestId('sim-step')).toContainText('Step 1 of 3')
  await expect(page.getByTestId('sim-status')).toContainText('1 failure:')
  await page.getByTestId('sim-step-next').click()
  await expect(page.getByTestId('sim-step')).toContainText('Step 2 of 3')
  await expect(page.getByTestId('sim-status')).toContainText('8 failures')
  await expect(page).toHaveURL(/su1-n08%2Fsvc-driver/)
  await page.getByTestId('sim-step-back').click()
  await expect(page.getByTestId('sim-step')).toContainText('Step 1 of 3')
  await expect(page.getByTestId('sim-step-back')).toBeDisabled()
  await expect(page.getByTestId('sim-status')).toContainText('1 failure:')
  await expect(page.getByTestId('sim-step-next')).toBeFocused()
  expect(errors).toEqual([])
})

test('Fail and Repair in the inspector, and Reset in the bar', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&sel=spine-01')
  await page.getByTestId('fail-down').click()
  await expect(page.getByTestId('sim-status')).toContainText('1 failure')
  await page.getByTestId('repair').click()
  await expect(page.getByTestId('impact')).toHaveCount(0)
  await page.getByTestId('fail-down').click()
  await page.getByTestId('sim-reset').click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-failed-count', '0')
  expect(errors).toEqual([])
})

test('Fabric Manager down: 8 GPUs lose NVLink, and the first action drains the node', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&server=su1-n05&fail=su1-n05/svc-fabric-manager:down')
  await expect(page.getByTestId('impact')).toContainText('8 no NVLink')
  await expect(page.getByTestId('impact')).toContainText('drain the node')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-hit-count', '8') // the 8 GPUs (the node view has no element with the server id)
  expect(errors).toEqual([])
})

test('the tracer goes around a failed spine', async ({ page }) => {
  const { errors } = await open(page, '#fail=spine-01:down&mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  await expect(page.getByTestId('hop-table')).toContainText('Spine 2')
  expect(errors).toEqual([])
})

test('search: "/" focuses the box; Enter opens the server in its closed group and centres it', async ({ page }) => {
  const { errors } = await open(page, '#su=4')
  await page.keyboard.press('/')
  await expect(page.getByTestId('search')).toBeFocused()
  await page.keyboard.type('su4 n10')
  await expect(page.getByTestId('search-list')).toContainText('su4-n10')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/sel=su4-n10/)
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-selected-in-view', '1')
  await expect(page.getByTestId('search')).toHaveValue('')
  expect(errors).toEqual([])
})

test('search: "ufm" opens the overview with the UFM block selected', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('search').fill('ufm')
  await page.getByTestId('search-list').getByRole('option').first().click()
  await expect(page).toHaveURL(/sel=blk-ufm/)
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-focus-count', /^[1-9]\d*$/)
  expect(errors).toEqual([])
})

test('search: "rail 3" lights rail 3; Esc in the box closes the list', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('search').fill('rail 3')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/rail=3/)
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-rail-lit', /^[1-9]\d*$/)
  await page.getByTestId('search').fill('zzz')
  await expect(page.getByTestId('search-list')).toContainText('No part matches')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('search-list')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the minimap shows the visible area; a click pans the canvas; Hide map hides it', async ({ page }) => {
  const { errors } = await open(page, '#su=4')
  await expect(page.getByTestId('minimap-box')).toHaveCount(0) // closed when the page opens
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  const map = page.getByTestId('minimap')
  await expect(map).toHaveAttribute('data-node-count', /^[1-9]\d*$/)
  const before = await map.getAttribute('data-viewport')
  expect(before).toMatch(/^-?\d+,-?\d+,-?\d+,-?\d+$/)
  await page.getByTestId('minimap-box').click({ position: { x: 6, y: 6 } })
  await expect(map).not.toHaveAttribute('data-viewport', before!)
  await page.getByRole('button', { name: 'Hide map', exact: true }).click()
  await expect(page.getByTestId('minimap-box')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  await expect(page.getByTestId('minimap-box')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('a long drag at the edge of the minimap does not push the view away from the graph', async ({ page }) => {
  const { errors } = await open(page, '#su=4')
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  const map = page.getByTestId('minimap')
  const width = async () => {
    const [x1, , x2] = (await map.getAttribute('data-viewport'))!.split(',').map(Number)
    return x2! - x1!
  }
  await expect(map).toHaveAttribute('data-viewport', /^-?\d+,/)
  const before = await width()
  const box = (await page.getByTestId('minimap-box').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(box.x + box.width - 5 - (i % 2), box.y + box.height / 2)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(100)
  expect(await width()).toBeGreaterThan(before * 0.4)
  expect(errors).toEqual([])
})

test('the Learn tab of a GPU links its written runbooks: RB-03 once, and RB-09 (assumed)', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05/gpu2')
  await page.getByRole('tab', { name: 'Learn' }).click()
  const written = page.getByTestId('written-runbooks')
  await expect(written.getByRole('button', { name: /^RB-03:/ })).toHaveCount(1)
  await expect(written.getByRole('button', { name: /^RB-09:/ })).toHaveCount(1)
  await expect(written).toContainText('assumed')
  // The title opens the runbook at its top; "First 5 minutes" opens it at section 3.
  await written.getByRole('button', { name: 'First 5 minutes' }).first().click()
  await expect(page.getByTestId('lib-title')).toHaveText('GPU ECC, Xid, thermal, power, and row remap')
  await expect(page).toHaveURL(/doc=rb-03&sec=3-first-5-minutes/)
  const at = await page.evaluate(() => {
    const head = document.querySelector('.lib-head')!.getBoundingClientRect().bottom
    const el = document.getElementById('3-first-5-minutes')!.getBoundingClientRect().top
    return el >= head - 1
  })
  expect(at).toBe(true)
  expect(errors).toEqual([])
})

test('a simulator incident links its written runbook', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&mode=simulate&fail=su1-n05/gpu2:xid79')
  await expect(page.getByTestId('impact').getByRole('button', { name: /^RB-03:/ })).toHaveCount(1)
  expect(errors).toEqual([])
})

test('the hop table has a Runbook column: RB-04 on an InfiniBand hop', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const table = page.getByTestId('hop-table')
  await expect(table.getByRole('columnheader', { name: 'Runbook' })).toHaveCount(1)
  await expect(table.getByRole('button', { name: 'RB-04', exact: true }).first()).toHaveAttribute('title', /^RB-04: /)
  // The column is next to Link, inside the panel: no sideways scroll to see it.
  const cell = await table.getByRole('button', { name: 'RB-04', exact: true }).first().boundingBox()
  const panel = await table.boundingBox()
  expect(cell!.x + cell!.width).toBeLessThan(panel!.x + panel!.width)
  expect(errors).toEqual([])
})

test('search: "rb-03" opens the runbook in the Library, and no tab', async ({ page }) => {
  const { errors } = await open(page)
  await page.evaluate(() => {
    ;(window as unknown as { opened: string[] }).opened = []
    window.open = ((url: string) => {
      ;(window as unknown as { opened: string[] }).opened.push(url)
      return null
    }) as typeof window.open
  })
  await page.getByTestId('search').fill('rb-03')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('lib-title')).toHaveText('GPU ECC, Xid, thermal, power, and row remap')
  await expect(page).toHaveURL(/mode=library&doc=rb-03/)
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([])
  expect(errors).toEqual([])
})

test('the modes are one segmented toggle: a click or an arrow key changes the mode', async ({ page }) => {
  const { errors } = await open(page)
  const modes = page.getByRole('radiogroup', { name: 'Mode' })
  await expect(modes.getByRole('radio', { name: 'Explore' })).toHaveAttribute('aria-checked', 'true')
  await modes.getByRole('radio', { name: 'Trace' }).click()
  await expect(page).toHaveURL(/mode=trace/)
  await expect(modes.getByRole('radio', { name: 'Trace' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/mode=simulate/)
  await expect(modes.getByRole('radio', { name: 'Simulate' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/mode=collectives/)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/mode=schedule/)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/mode=library/)
  await expect(modes.getByRole('radio', { name: 'Library' })).toBeFocused()
  await page.keyboard.press('ArrowRight') // wraps to Explore
  await expect(page).not.toHaveURL(/mode=/)
  expect(errors).toEqual([])
})

test('a scenario plays the hops one by one, immediately; Pause and Next stop it', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-trace').click()
  const scenario = page.getByTestId('trace-scenario')
  await scenario.selectOption('pxn') // 6 hops: about 2 s at Fast
  await expect(page.getByTestId('trace-play')).toHaveText('Pause')
  const label = page.getByTestId('trace-hop')
  await expect(label).toHaveText(/^Hop (\d+) of \1$/, { timeout: 15_000 }) // the last hop
  await expect(page.getByTestId('trace-play')).toHaveText('Play')

  // Play at the last hop starts again from hop 1; Pause keeps the hop.
  await page.getByTestId('trace-speed').selectOption('slow')
  await page.getByTestId('trace-play').click()
  await expect(label).toHaveText(/^Hop 1 of/)
  await page.getByTestId('trace-play').click()
  await expect(page.getByTestId('trace-play')).toHaveText('Play')
  const paused = await label.textContent()
  await page.waitForTimeout(2500)
  await expect(label).toHaveText(paused!)

  // A manual step stops it.
  await page.getByTestId('trace-play').click()
  await page.getByTestId('trace-next').click()
  await expect(page.getByTestId('trace-play')).toHaveText('Play')
  expect(errors).toEqual([])
})

test('a trace that a URL opens does not play', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  await expect(page.getByTestId('trace-play')).toHaveText('Play')
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('trace-hop')).toHaveText(/^Hop 1 of/)
  expect(errors).toEqual([])
})

test('a play stops when a hash change opens a trace, and when the user clicks a hop row', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-trace').click()
  await page.getByTestId('trace-scenario').selectOption('pxn')
  await page.getByTestId('trace-speed').selectOption('normal')
  await expect(page.getByTestId('trace-play')).toHaveText('Pause')
  await page.evaluate(() => (location.hash = '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace'))
  await expect(page.getByTestId('trace-play')).toHaveText('Play')
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('trace-hop')).toHaveText(/^Hop 1 of/)

  await page.getByTestId('trace-play').click()
  await expect(page.getByTestId('trace-play')).toHaveText('Pause')
  await page.getByTestId('hop-table').locator('tbody tr').first().click()
  await expect(page.getByTestId('trace-play')).toHaveText('Play')
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('trace-hop')).toHaveText(/^Hop 1 of/)
  expect(errors).toEqual([])
})

test('the page has an app icon and an SVG favicon (a data URI, no network)', async ({ page }) => {
  const { errors, remote } = await open(page)
  const href = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(href).toMatch(/^data:image\/svg\+xml,/)
  await expect(page.locator('header h1 svg')).toHaveCount(1)
  expect(remote).toEqual([])
  expect(errors).toEqual([])
})

test('dark theme: the controls are dark, the dropdowns are styled, the footer is one row', async ({ browser }) => {
  const page = await browser.newPage({ colorScheme: 'dark', viewport: { width: 1280, height: 720 } })
  const { errors } = await open(page, '#su=18')
  const bg = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await bg('[data-testid="search"]')).not.toBe('rgb(255, 255, 255)')
  expect(await bg('.config select')).not.toBe('rgb(255, 255, 255)')
  expect(await page.locator('.config select').first().evaluate((el) => getComputedStyle(el).appearance)).toBe('none')
  const footer = page.getByTestId('numbers')
  expect((await footer.boundingBox())!.height).toBeLessThan(30)
  expect(await footer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true) // nothing is cut off
  expect(errors).toEqual([])
  await page.close()
})

test('the footer fits one row also for a dual-plane design', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const { errors } = await open(page, '#platform=b300&build=oem-hgx&fabric=spectrum-x&design=ent-b300&planes=dual&su=32')
  await expect(page.getByTestId('numbers')).toContainText('128 nodes')
  expect(await page.getByTestId('numbers').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.close()
})

test('the status badge of a fact is its source: a vendor page, a Read, or no link', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05/gpu2')
  // A vendor page keeps its link and its tab.
  const vendor = page.locator('.specs a.status').first()
  await expect(vendor).toHaveAttribute('target', '_blank')
  await expect(vendor).toHaveAttribute('href', /^https:\/\//)
  // A document of the portal opens in the reader, at the section of the cited line.
  const read = page.locator('.specs button.status').first()
  await read.click()
  await expect(page.getByTestId('lib-title')).toBeVisible()
  await expect(page).toHaveURL(/mode=library&doc=/)
  // A fact with no source has no link.
  await page.getByTestId('lib-back').click()
  await expect(page.locator('.specs span.status').first()).not.toHaveAttribute('href', /./)
  expect(errors).toEqual([])
})

test('the scenario list shows the scenario that is active', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('mode-trace').click()
  await page.getByTestId('trace-scenario').selectOption('pxn')
  await expect(page.getByTestId('trace-scenario')).toHaveValue('pxn')
  await page.getByTestId('trace-clear').click()
  await expect(page.getByTestId('trace-scenario')).toHaveValue('')
  expect(errors).toEqual([])
})

test('search: the parts of the open server, grouped by kind, the match in bold, and a clear button', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05')
  await page.getByTestId('search').fill('gpu 2')
  const list = page.getByTestId('search-list')
  await expect(list.getByRole('option').first()).toContainText('GPU 2')
  await expect(list.locator('[role="presentation"].group').first()).toHaveText(/gpu/i)
  await expect(list.locator('mark').first()).toBeVisible()
  await page.getByRole('button', { name: 'Remove the search text' }).click()
  await expect(page.getByTestId('search')).toHaveValue('')
  await expect(page.getByTestId('search')).toBeFocused()
  expect(errors).toEqual([])
})

test('"/" focuses search also when a select has the focus; a trace bar with no view tools has no gap above it', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&view=overview')
  await page.getByTestId('trace-scenario').focus()
  await page.keyboard.press('/')
  await expect(page.getByTestId('search')).toBeFocused()
  const bar = await page.getByTestId('tracebar').boundingBox()
  const main = await page.locator('main').boundingBox()
  expect(bar!.y - main!.y).toBeLessThan(16)
  expect(errors).toEqual([])
})
test('a selected port lights its row in the port map', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-k1&sel=su1-n01/port-c0')
  await expect(page.locator('.portmap tr.on')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('the header stays one row at 1280 px, also with a long breadcrumb', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2&path=user-ui&view=trace')
  expect((await page.locator('header').boundingBox())!.height).toBeLessThanOrEqual(52)
  expect(errors).toEqual([])
  await page.close()
})

test('the zoom bar changes the zoom and fits the view; the header map opens the minimap', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05')
  const canvas = page.getByTestId('canvas')
  const zoom = async () => Number(await canvas.getAttribute('data-zoom'))
  await expect(canvas).toHaveAttribute('data-zoom', /\d/)
  const start = await zoom()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(zoom).toBeGreaterThan(start)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(zoom).toBeLessThan(start)
  await page.getByRole('button', { name: 'Fit' }).click()
  await expect.poll(zoom).toBeCloseTo(start, 2)
  await page.getByRole('button', { name: 'Show map', exact: true }).click()
  await expect(page.getByTestId('minimap-box')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('a panel opens the guide at the step that shows it', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-k1&face=front')
  await page.getByTestId('portmap-guide').click()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 6 of 8')
  await expect(page).toHaveURL(/guide=first\.6/)
  await page.getByTestId('guide-close').click()
  await page.getByTestId('mode-schedule').click()
  await page.getByTestId('sched-guide').click()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 1 of 6')
  await page.getByTestId('guide-close').click()
  await page.getByTestId('mode-simulate').click()
  await page.getByTestId('diag-view-chain').click()
  await page.getByTestId('diag-guide').click()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 3 of 7')
  expect(errors).toEqual([])
})

test('the graph is fitted on load, and a resize fits it again when it no longer fits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { errors } = await open(page, '')
  const inside = () =>
    page.evaluate(() => {
      const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
      const bb = cy.elements().renderedBoundingBox()
      return bb.x1 >= -2 && bb.y1 >= -2 && bb.x2 <= cy.width() + 2 && bb.y2 <= cy.height() + 2
    })
  await expect.poll(inside).toBe(true) // the page opens on a fitted graph
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  expect(await inside()).toBe(false) // the graph is out of the canvas
  await page.setViewportSize({ width: 1300, height: 800 })
  await expect.poll(inside).toBe(true) // a resize fits it again
  // A view with a bar: the bar takes its height after the first paint, and the graph is fitted on the final size.
  await page.evaluate(() => (location.hash = '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace'))
  await expect(page.getByTestId('hop-table')).toBeVisible()
  await expect.poll(inside).toBe(true)
  expect(errors).toEqual([])
})

test('the development server layout: a canvas that is 0 px at the first fit is fitted when it gets a size', async ({ page }) => {
  // The development server adds the stylesheet after the first render, so the canvas has no size when the app first
  // fits the graph. The observer fits again when the size arrives.
  await page.setViewportSize({ width: 1280, height: 900 })
  const { errors } = await open(page, '')
  const fitted = () =>
    page.evaluate(() => {
      const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
      const bb = cy.elements().renderedBoundingBox()
      const dx = (bb.x1 + bb.x2) / 2 - cy.width() / 2
      const dy = (bb.y1 + bb.y2) / 2 - cy.height() / 2
      return cy.zoom() !== 1 && Math.abs(dx) <= 3 && Math.abs(dy) <= 3
    })
  await expect.poll(fitted).toBe(true) // not the default zoom of 1, and centred
  expect(errors).toEqual([])
})

test('a fold that grows the canvas fits the graph again', async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 879 })
  const { errors } = await open(page, '#sel=su1-n71') // the inspector is open, so the canvas is narrow
  const centred = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } }
      const cy = el._cyreg.cy
      const bb = cy.elements().renderedBoundingBox()
      const dx = (bb.x1 + bb.x2) / 2 - cy.width() / 2
      const dy = (bb.y1 + bb.y2) / 2 - cy.height() / 2
      return Math.abs(dx) <= 3 && Math.abs(dy) <= 3 && bb.x1 >= -2 && bb.y1 >= -2 && bb.x2 <= cy.width() + 2 && bb.y2 <= cy.height() + 2
    })
  await expect.poll(centred).toBe(true)
  await page.keyboard.press('Escape') // the selection goes, the inspector folds, the canvas grows
  await expect(page.locator('aside.inspector')).toHaveAttribute('data-folded', 'true')
  await expect.poll(centred).toBe(true) // the graph fills the wider canvas, it is not left of it
  expect(errors).toEqual([])
})

test('PNG saves the graph of the view', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-png').click()])
  expect(download.suggestedFilename()).toBe('ai-factory-explore-node-su1-n05.png')
  expect(errors).toEqual([])
})

test('the Specs tab gives the provenance of the facts of a part', async ({ page }) => {
  const { errors } = await open(page, '#sel=su1-n71')
  await expect(page.getByTestId('provenance-line')).toContainText('Provenance:')
  await expect(page.getByTestId('provenance')).toContainText('A confirmed value would replace')
  expect(errors).toEqual([])
})

test('hover shows the name and what a double-click does; the inspector has an Open button', async ({ page }) => {
  const { errors } = await open(page, '#su=1')
  await page.evaluate(() => {
    const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
    cy.getElementById('su1').emit('mouseover')
  })
  await expect(page.getByTestId('hover-hint')).toContainText('Double-click to open or close')
  await page.evaluate(() => {
    const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
    cy.getElementById('su1').emit('mouseout')
  })
  await expect(page.getByTestId('hover-hint')).toBeHidden()
  await page.evaluate(() => (location.hash = '#su=1&open=1&sel=su1-n05'))
  await page.getByTestId('open-part').click()
  await expect(page).toHaveURL(/server=su1-n05/)
  expect(errors).toEqual([])
})

test('the links hide during a pan only in a large view', async ({ page }) => {
  const { errors } = await open(page, '#su=1')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-hide-edges', '0')
  await open(page, '#su=8')
  await page.getByRole('button', { name: 'Expand all SUs' }).click()
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-hide-edges', '1')
  expect(errors).toEqual([])
})

test('the bottom panel: a drag or the arrow keys change its height; its header stays on top', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const panel = page.getByTestId('hop-table')
  const h0 = (await panel.boundingBox())!.height
  const handle = page.getByRole('separator', { name: 'Panel height' })
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(h0 + 80)
  await handle.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThan(h0 + 120)
  expect(errors).toEqual([])
})

test('the trace bar keeps Back, the hop, Next, Play, and the speed on one row at 1280 px', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y
  const row = await y('trace-back')
  for (const id of ['trace-hop', 'trace-next', 'trace-play', 'trace-speed']) expect(Math.abs((await y(id)) - row), id).toBeLessThan(6)
  expect(errors).toEqual([])
  await page.close()
})

test('the configuration folds; the inspector folds with no selection; the canvas gets the space', async ({ page }) => {
  const { errors } = await open(page, '#su=1')
  const width = async () => (await page.getByTestId('canvas').boundingBox())!.width
  const w0 = await width()
  await expect(page.locator('aside.inspector')).toHaveAttribute('data-folded', 'true') // nothing is selected
  await page.getByRole('button', { name: 'Hide the configuration' }).click()
  await expect.poll(width).toBeGreaterThan(w0 + 150)
  await page.getByRole('button', { name: 'Show the configuration' }).click()
  await page.evaluate(() => (location.hash = '#su=1&sel=su1-leaf-r3'))
  await expect(page.locator('aside.inspector')).toHaveAttribute('data-folded', 'false')
  expect(errors).toEqual([])
})

test('header tools: help, the theme switch (also the canvas), and Copy link', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByRole('button', { name: 'Help' }).click()
  await expect(page.getByRole('dialog', { name: 'How to use' })).toContainText('Esc')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).not.toHaveURL(/view=overview/) // Esc closed only the dialog
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-theme', 'dark')
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // The arrow keys move to the next choice, and past the last one back to auto, which follows the system.
  await page.getByTestId('theme-light').press('ArrowRight')
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('theme-dark').press('ArrowRight')
  await expect(page.getByTestId('theme-auto')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByTestId('copy-status')).toHaveText(/Copied|Press (Ctrl|Cmd)\+C/)
  expect(errors).toEqual([])
})

// The screen position of a canvas element (for a real mouse event).
async function screenPos(page: Page, id: string) {
  return page.evaluate((id) => {
    const el = document.querySelector('[data-testid="canvas"]') as HTMLElement
    const cy = (el as unknown as { _cyreg: { cy: any } })._cyreg.cy
    const p = cy.getElementById(id).renderedPosition()
    const r = el.getBoundingClientRect()
    return { x: r.left + p.x, y: r.top + p.y }
  }, id)
}

test('a real double-click opens the part under the pointer (the inspector opens on the first click)', async ({ page }) => {
  const { errors } = await open(page, '#su=1&open=1')
  const p = await screenPos(page, 'su1-n05')
  await page.mouse.dblclick(p.x, p.y)
  await expect(page).toHaveURL(/server=su1-n05(&|$)/)
  expect(errors).toEqual([])
})

test('a stored panel height larger than the screen is limited, so the canvas stays', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.addInitScript(() => localStorage.setItem('afp.ui', JSON.stringify({ panel: 2000 })))
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  expect((await page.getByTestId('canvas').boundingBox())!.height).toBeGreaterThanOrEqual(150)
  expect(errors).toEqual([])
  await page.close()
})

test('an empty port map: no panel handle, and the zoom bar stays at the bottom of the canvas', async ({ page }) => {
  const { errors } = await open(page, '#platform=gb200-nvl72&racks=1&rack=su1-k1')
  await expect(page.getByRole('separator', { name: 'Panel height' })).toHaveCount(0)
  const canvas = (await page.getByTestId('canvas').boundingBox())!
  const bar = (await page.getByRole('toolbar', { name: 'View' }).boundingBox())!
  expect(canvas.y + canvas.height - (bar.y + bar.height)).toBeLessThan(20)
  expect(errors).toEqual([])
})

test('the legend starts below the trace bar also when the view tools show; Ctrl and - do not zoom the canvas', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2&server=su1-n40&color=tenant')
  const bar = (await page.getByTestId('tracebar').boundingBox())!
  const legend = (await page.getByTestId('overlay-legend').boundingBox())!
  expect(legend.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  const zoom = await page.getByTestId('canvas').getAttribute('data-zoom')
  await page.keyboard.press('Control+Minus')
  await page.waitForTimeout(200)
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-zoom', zoom!)
  expect(errors).toEqual([])
})

test('the browser Back button goes back one level, not one click', async ({ page }) => {
  const { errors } = await open(page, '#su=1&open=1')
  await page.evaluate(() => {
    const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
    cy.getElementById('su1-n05').emit('tap')
  })
  await expect(page).toHaveURL(/sel=su1-n05/)
  await page.getByTestId('open-part').click() // the node view of su1-n05: a new level
  await expect(page).toHaveURL(/server=su1-n05/)
  await page.keyboard.press('2') // a rail: the same level
  await page.goBack()
  await expect(page).not.toHaveURL(/server=/)
  await expect(page.getByTestId('breadcrumb')).not.toContainText('su1-n05')
  expect(errors).toEqual([])
})

test('Esc goes up and replaces the history entry: Back after Esc does not go down again', async ({ page }) => {
  const { errors } = await open(page, '#su=1&open=1')
  await page.evaluate(() => {
    const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
    cy.getElementById('su1-n05').emit('tap')
  })
  await page.getByTestId('open-part').click()
  await expect(page).toHaveURL(/server=su1-n05/)
  await page.locator('body').press('Escape')
  await expect(page).not.toHaveURL(/server=/)
  await page.goBack()
  await expect(page).not.toHaveURL(/server=/)
  expect(errors).toEqual([])
})

test('Trace mode in the fabric: pick the source and the destination with the picker', async ({ page }) => {
  const { errors } = await open(page, '#su=1&mode=trace')
  const picker = page.getByTestId('trace-picker')
  await picker.getByLabel('Server').selectOption('su1-n05')
  await picker.getByLabel('GPU').selectOption('2')
  await picker.getByRole('button', { name: 'Use this GPU' }).click()
  await expect(page.getByTestId('trace-status')).toContainText('su1-n05/gpu2')
  await picker.getByLabel('Server').selectOption('su1-n40')
  await picker.getByLabel('GPU').selectOption('5')
  await picker.getByRole('button', { name: 'Use this GPU' }).click()
  await expect(page).toHaveURL(/trace=su1-n05%2Fgpu2%2Csu1-n40%2Fgpu5/)
  await expect(page.getByTestId('hop-table')).toBeVisible()
  expect(errors).toEqual([])
})

test('keyboard: a skip link, the inspector tabs with the arrow keys, ? for the help, and a hop row with Enter', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05/gpu2')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Go to the canvas' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Go to the inspector' })).toBeFocused()
  const url = page.url()
  await page.keyboard.press('Enter')
  await expect(page.locator('aside.inspector')).toBeFocused()
  expect(page.url()).toBe(url)
  await page.getByRole('tab', { name: 'Specs' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Signals' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'How to use' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(() => (location.hash = '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace'))
  await page.getByTestId('hop-row-2').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('trace-hop')).toHaveText(/^Hop 3 of/)
  expect(errors).toEqual([])
})

test('a config change that forces other switches says so; the trace status is live', async ({ page }) => {
  const { errors } = await open(page)
  await page.getByTestId('cfg-platform').selectOption('gb300-nvl72')
  await expect(page.getByTestId('also-changed')).toContainText('Also changed')
  await expect(page.getByTestId('also-changed')).toHaveAttribute('role', 'status')
  await page.getByTestId('mode-trace').click()
  await expect(page.getByTestId('trace-status')).toHaveAttribute('aria-live', 'polite')
  expect(errors).toEqual([])
})

// A tap on a canvas element by id (as the tap helper above), for the history tests.
async function tapId(page: Page, id: string) {
  await page.evaluate((id) => {
    const cy = (document.querySelector('[data-testid="canvas"]') as unknown as { _cyreg: { cy: any } })._cyreg.cy
    cy.getElementById(id).emit('tap')
  }, id)
}

test('Back goes up one level and keeps the work done in the level: the configuration and the failures', async ({ page }) => {
  const { errors } = await open(page, '#su=1&open=1&mode=simulate')
  await tapId(page, 'su1-n05')
  await page.getByTestId('open-part').click()
  await expect(page).toHaveURL(/server=su1-n05/)
  await tapId(page, 'su1-n05/gpu2')
  await page.getByTestId('fail-xid79').click()
  await page.getByTestId('cfg-ufm').selectOption('single')
  await page.goBack()
  await expect(page).not.toHaveURL(/server=/)
  await expect(page).toHaveURL(/fail=/)
  await expect(page).toHaveURL(/ufm=single/)
  expect(errors).toEqual([])
})

test('Esc steps back in the history: one Back after Esc goes back past the fabric, with no dead press', async ({ page }) => {
  const { errors } = await open(page, '#su=1')
  await page.evaluate(() => (location.hash = '#su=1&open=1'))
  await tapId(page, 'su1-n05')
  await page.getByTestId('open-part').click()
  await expect(page).toHaveURL(/server=su1-n05/)
  const before = await page.evaluate(() => history.length)
  await page.locator('body').press('Escape')
  await expect(page).not.toHaveURL(/server=/)
  await page.goBack()
  await expect(page).not.toHaveURL(/open=1/) // the entry before the fabric with the open group
  expect(await page.evaluate(() => history.length)).toBe(before)
  expect(errors).toEqual([])
})

test('the trace picker: a smaller scale and another platform keep it usable; a pick in another node view leaves no hidden selection', async ({ page }) => {
  const { errors } = await open(page, '#su=4&mode=trace')
  const picker = page.getByTestId('trace-picker')
  await picker.getByLabel('SU').selectOption('4')
  await picker.getByLabel('GPU').selectOption('7')
  await page.getByTestId('cfg-suCount').selectOption('1')
  await expect(picker.getByRole('button', { name: 'Use this GPU' })).toBeEnabled()
  await page.getByTestId('cfg-platform').selectOption('gb300-nvl72')
  await expect(picker.getByLabel('GPU')).toHaveValue('0')
  await page.evaluate(() => (location.hash = '#su=1&server=su1-n05&mode=trace'))
  await picker.getByLabel('Server').selectOption('su1-n40')
  await picker.getByRole('button', { name: 'Use this GPU' }).click()
  await expect(page).not.toHaveURL(/sel=/)
  expect(errors).toEqual([])
})

test('a click in the inspector draws no focus frame; the link to the inspector does', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05/gpu2')
  await page.getByTestId('inspector-title').click()
  const outline = await page.locator('aside.inspector').evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('none')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Go to the inspector' })).toBeVisible()
  expect(errors).toEqual([])
})

test('the trace hop effect: done, current, and later hops; no pulse on a hop', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const canvas = page.getByTestId('canvas')
  await page.getByTestId('trace-next').click()
  await page.getByTestId('trace-next').click()
  await expect(canvas).toHaveAttribute('data-hop-on', '2')
  await expect(canvas).toHaveAttribute('data-hops-done', '2')
  expect(await canvas.getAttribute('data-pulse')).toBe('off') // read once: the old pulse set 'on' in the same effect
  expect(errors).toEqual([])
})

// The Cytoscape instance of the canvas, in the page (the e2e helpers use the same way).
const CY = `(document.querySelector('[data-testid="canvas"]'))._cyreg.cy`

test('the current hop: the dashes move and a packet moves; a tap on a part does not stop it; Esc stops both', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const canvas = page.getByTestId('canvas')
  await expect(canvas).toHaveAttribute('data-ants', 'on')
  await expect(canvas).toHaveAttribute('data-packet', 'on')
  const sample = (expr: string) => page.evaluate(`(() => { const cy = ${CY}; return ${expr} })()`) as Promise<number>
  const three = async (expr: string) => {
    const out: number[] = []
    for (let i = 0; i < 3; i++) {
      out.push(await sample(expr))
      await page.waitForTimeout(150)
    }
    return new Set(out.map((v) => Math.round(v * 10))).size
  }
  expect(await three(`Number(cy.getElementById('hop-0').style('line-dash-offset'))`)).toBeGreaterThan(1)
  await tap(page, 'su1-n05/gpu2')
  // The selection does not stop the packet: samples over more than one move and rest (900 + 600 ms).
  const xs: number[] = []
  for (let i = 0; i < 9; i++) {
    xs.push(await sample(`cy.$('.packet').position('x')`))
    await page.waitForTimeout(200)
  }
  expect(new Set(xs.map(Math.round)).size).toBeGreaterThan(1)
  await page.locator('body').press('Escape')
  await expect(canvas).toHaveAttribute('data-ants', 'off')
  await expect(canvas).toHaveAttribute('data-packet', 'off')
  expect(await sample(`cy.$('.packet').length`)).toBe(0)
  expect(errors).toEqual([])
})

test('reduced motion: no moving dashes and no packet; the hop classes stay', async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const canvas = page.getByTestId('canvas')
  await expect(canvas).toHaveAttribute('data-hop-on', '0')
  await expect(canvas).toHaveAttribute('data-ants', 'off')
  await expect(canvas).toHaveAttribute('data-packet', 'off')
  expect(errors).toEqual([])
  await page.close()
})

test('the packet moves on the visible link only (not over the parts), and moves again after a Pause', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const probe = () =>
    page.evaluate(`(() => { const cy = ${CY}; const e = cy.getElementById('hop-0'); const k = cy.$('.packet'); return k.length ? [k.position('x'), e.sourceEndpoint().x, e.targetEndpoint().x] : null })()`) as Promise<[number, number, number] | null>
  for (let i = 0; i < 8; i++) {
    const p = await probe()
    expect(p).not.toBeNull()
    expect(p![0]).toBeGreaterThanOrEqual(p![1] - 1)
    expect(p![0]).toBeLessThanOrEqual(p![2] + 1)
    await page.waitForTimeout(190)
  }
  // Slow Play, then Pause when the packet is at the target: the still trace moves it again.
  await page.getByTestId('trace-speed').selectOption('slow')
  await page.getByTestId('trace-play').click()
  await page.waitForTimeout(1750)
  await page.getByTestId('trace-play').click() // Pause
  const xs: number[] = []
  for (let i = 0; i < 12; i++) {
    const p = await probe()
    if (p) xs.push(Math.round(p[0]))
    await page.waitForTimeout(200)
  }
  expect(new Set(xs).size).toBeGreaterThan(1)
  expect(errors).toEqual([])
})

test('a real click on a hop end keeps the current hop thick, and the packet moving', async ({ page }) => {
  const { errors } = await open(page, '#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&pxn=0&view=trace')
  const p = await screenPos(page, 'su1-n05/nic2')
  await page.mouse.click(p.x, p.y)
  await expect(page).toHaveURL(/sel=su1-n05%2Fnic2/)
  const width = await page.evaluate(`(() => ${CY}.getElementById('hop-0').style('width'))()`)
  expect(width).toBe('7px')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-packet', 'on')
  expect(errors).toEqual([])
})

test('Collectives mode plays a ring AllReduce on 2 nodes, and the NIC is the limit', async ({ page }) => {
  const { errors, remote } = await open(page)
  await page.getByTestId('mode-collectives').click()
  await expect(page.getByTestId('collbar')).toBeVisible()
  await expect(page.getByTestId('ring-diagram')).toBeVisible()
  await page.getByTestId('coll-scope').selectOption('2n')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 0 of 30 · start')
  await expect(page.getByTestId('busbw-bottleneck')).toContainText('NIC')
  await expect(page.getByTestId('busbw-limit')).toHaveText('800.0 GB/s')
  await expect(page.getByTestId('busbw-bottleneck')).toContainText('8 channels × 100.0 GB/s')
  for (let i = 0; i < 30; i++) await page.getByTestId('coll-next').click()
  await expect(page.getByTestId('coll-step')).toHaveText('Step 30 of 30 · all-gather')
  await expect(page.locator('[data-testid^="cell-"][data-count="16"]')).toHaveCount(256)
  await expect(page.getByTestId('coll-step-text')).toContainText('full sum')
  await page.getByTestId('busbw-measured').fill('640')
  await expect(page.getByTestId('busbw-percent')).toHaveText('= 80 % of the limit')
  expect(new URL(page.url()).hash).toContain('coll=allreduce.ring.2n.30.1g')
  // At the end, Play starts again from the start, and the steps move.
  await page.getByTestId('coll-play').click()
  await expect(page.getByTestId('coll-play')).toHaveText('Pause')
  await expect(page.getByTestId('coll-step')).toHaveText(/^Step ([1-9]|[12]\d) of 30/)
  await page.getByTestId('coll-play').click()
  await expect(page.getByTestId('coll-play')).toHaveText('Play')
  expect(errors).toEqual([])
  expect(remote).toEqual([])
})

test('a Collectives link opens on its step, and NVLink is the limit on 1 node', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=allgather.ring.1.3.1g')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 3 of 7 · all-gather')
  // One arrow for each rank (an arrow on a row is a horizontal line: its box has no height, so no visibility check).
  await expect(page.locator('[data-testid^="send-"]')).toHaveCount(8)
  await expect(page.getByTestId('cell-3-3')).toHaveAttribute('data-count', '1')
  // A shared link shows the busbw panel, and its notes as text (not only in a tooltip).
  await expect(page.getByTestId('busbw')).toBeVisible()
  await expect(page.getByTestId('coll-notes')).toContainText('NCCL_ALGO=Ring')
  expect(errors).toEqual([])
})

test('Collectives mode on a dual-plane fabric says that NCCL can use the two planes', async ({ page }) => {
  const { errors } = await open(page, '#fabric=spectrum-x&planes=dual&su=4&mode=collectives&coll=allreduce.ring.2.0.1g')
  await expect(page.getByTestId('busbw-limit')).toHaveText('400.0 GB/s')
  await expect(page.getByTestId('coll-notes')).toContainText('two planes')
  expect(errors).toEqual([])
})

test('Collectives mode on an NVL72 preset starts on 1 tray, and 4 trays give the NVLink limit', async ({ page }) => {
  const { errors } = await open(page, '#platform=gb200-nvl72&mode=collectives')
  await expect(page.getByTestId('coll-scope')).toHaveValue('1t')
  await expect(page.getByTestId('ring-diagram')).toBeVisible()
  await page.getByTestId('coll-scope').selectOption('4t')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 0 of 30 · start')
  await expect(page.getByTestId('busbw-limit')).toHaveText('900.0 GB/s')
  expect(errors).toEqual([])
})

test('Tree on 8 nodes, 1 GPU each: plays to the end, and the two chunks are full on each rank', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=allreduce.tree.n8.0.1g')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 0 of 6 · start')
  for (let i = 0; i < 6; i++) await page.getByTestId('coll-next').click()
  await expect(page.getByTestId('coll-step')).toHaveText('Step 6 of 6 · broadcast')
  await expect(page.locator('[data-testid^="cell-"][data-count="8"]')).toHaveCount(16)
  await expect(page.getByTestId('busbw-limit')).toHaveText('87.5 GB/s')
  expect(errors).toEqual([])
})

test('NVLS on 1 node: the limit is above the NVLink speed, with its note as text', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=allreduce.nvls.1n.1.1g')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 1 of 2 · switch-reduce')
  await expect(page.getByTestId('busbw-limit')).toHaveText('1575.0 GB/s')
  await expect(page.getByTestId('coll-notes')).toContainText('the NVSwitch chips do the addition')
  await expect(page.locator('[data-testid^="send-"][data-testid$="-sw"]')).toHaveCount(8)
  // The legs to the switch carry 7 chunks to add; a leg from the switch carries one sum, with no label.
  await expect(page.getByTestId('send-0-sw')).toContainText('+×7')
  await expect(page.getByTestId('send-sw-3').locator('text')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('AlltoAll on 1 node: at the end, each cell names the rank whose data it holds', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=alltoall.p2p.1n.7.1g')
  await expect(page.getByTestId('cell-2-5')).toHaveText('r5')
  await expect(page.getByTestId('cell-5-2')).toHaveText('r2')
  await page.getByTestId('coll-collective').selectOption('broadcast')
  await expect(page.getByTestId('coll-algorithm')).toHaveValue('ring')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 0 of 14 · start')
  expect(errors).toEqual([])
})

test('AlltoAll on 2 nodes: a note says why the limit is above the NIC speed', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=alltoall.p2p.2n.0.1g')
  await expect(page.getByTestId('busbw-limit')).toHaveText('187.5 GB/s')
  await expect(page.getByTestId('coll-notes')).toContainText('above the NIC speed')
  expect(errors).toEqual([])
})

test('the Enterprise RA (4 servers in SU 1) offers 3 scopes, and an 8-node link says why it has no ranks', async ({ page }) => {
  const { errors } = await open(page, '#build=oem-hgx&fabric=spectrum-x&design=ent-b300&planes=dual&su=8&cooling=liquid&mode=collectives&coll=allreduce.ring.n8.0.1g')
  await expect(page.getByTestId('coll-status')).toContainText('SU 1 of this design has 4 servers')
  await expect(page.locator('[data-testid="coll-scope"] option:not([disabled])')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('the channel picker: all channels of a ring on 2 nodes on the canvas, in the URL and the breadcrumb', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=allreduce.ring.2n.0.1g')
  await page.getByTestId('coll-channel').selectOption('all')
  await expect(page).toHaveURL(/coll=allreduce\.ring\.2n\.0\.1g\.call/)
  await expect(page.getByTestId('breadcrumb')).toContainText('all channels')
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-element-count', '138') // 42 parts and 96 links
  await page.getByTestId('coll-channel').selectOption('3')
  await expect(page.getByTestId('ring-diagram').locator('title').first()).toHaveText('Rank 0: su1-n01/gpu3')
  expect(errors).toEqual([])
})

test('2 nodes in different SUs: the link opens with the 8-channel limit and the spine note', async ({ page }) => {
  const { errors } = await open(page, '#su=2&mode=collectives&coll=allreduce.ring.2s.0.1g')
  await expect(page.getByTestId('coll-scope')).toHaveValue('2s')
  await expect(page.getByTestId('busbw-limit')).toHaveText('800.0 GB/s')
  await expect(page.getByTestId('coll-notes')).toContainText('spine')
  expect(errors).toEqual([])
})

test('the nccl-tests reader: a 2-node AllReduce against the limit of the model, with its chart and table', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives')
  await page.getByTestId('coll-reader').click()
  await page.getByTestId('nccl-input').fill(ncclSample())
  await expect(page.getByTestId('nccl-summary')).toContainText('all_reduce_perf: 16 ranks on 2 hosts')
  await expect(page.getByTestId('nccl-limit')).toContainText('800.0 GB/s')
  await expect(page.getByTestId('nccl-marks')).toContainText('84 % of the limit')
  await expect(page.getByTestId('nccl-chart')).toBeVisible()
  await expect(page.locator('[data-testid="nccl-table"] tbody tr')).toHaveCount(6)
  await page.getByTestId('nccl-threshold').fill('90')
  await expect(page.getByTestId('nccl-marks')).toContainText('below the threshold (90 %)')
  await expect(page.getByTestId('nccl-marks')).toContainText('RB-02')
  expect(errors).toEqual([])
})

test('the nccl-tests reader marks data errors, and asks for the collective when the output does not name it', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives')
  await page.getByTestId('coll-reader').click()
  await page.getByTestId('nccl-input').fill(ncclSample({ test: null, wrongAt: 16777216 }))
  await expect(page.getByTestId('nccl-collective')).toBeVisible()
  await page.getByTestId('nccl-collective').selectOption('allreduce')
  await expect(page.getByTestId('nccl-limit')).toContainText('800.0 GB/s')
  await expect(page.getByTestId('nccl-marks')).toContainText('Data errors')
  await expect(page.getByTestId('nccl-marks')).toContainText('RB-03')
  expect(errors).toEqual([])
})

test('the nccl-tests reader: a run with no scope of the app takes a typed limit; a log gives a message', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives')
  await page.getByTestId('coll-reader').click()
  await page.getByTestId('nccl-input').fill('node-a:1:1 [0] NCCL INFO Channel 00/08 : 0 1 2 3')
  await expect(page.getByTestId('nccl-error')).toContainText('No result table')
  await page.getByTestId('nccl-input').fill(ncclSample({ hosts: 3 }))
  await page.getByTestId('nccl-limit-input').fill('700')
  await expect(page.getByTestId('nccl-marks')).toContainText('96 % of the limit')
  expect(errors).toEqual([])
})

test('the nccl-tests chart: the tooltip of the first and the last size stays inside the chart', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=allreduce.ring.2n.0.1g')
  await page.getByTestId('coll-reader').click()
  await page.getByTestId('nccl-input').fill(ncclSample())
  const chart = page.getByTestId('nccl-chart')
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.locator('svg').boundingBox())!
  for (const fx of [0.085, 0.83]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.5)
    const tip = (await page.locator('.nccl-tip').boundingBox())!
    expect(tip.x).toBeGreaterThanOrEqual(box.x)
    expect(tip.x + tip.width).toBeLessThanOrEqual(box.x + box.width)
  }
  expect(errors).toEqual([])
})

test('the nccl-tests reader: an output with no rank lines says so, and takes a typed limit', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives')
  await page.getByTestId('coll-reader').click()
  await page.getByTestId('nccl-input').fill(ncclSample().split('\n').filter((l) => !/^#\s+Rank/.test(l)).join('\n'))
  await expect(page.getByTestId('nccl-limit')).toContainText('the output has no rank lines')
  await page.getByTestId('nccl-limit-input').fill('800')
  await expect(page.getByTestId('nccl-marks')).toContainText('84 % of the limit')
  expect(errors).toEqual([])
})

test('the parallelism mapper: TP 8 × DP 4 on 4 servers; TP on NVLink, DP on one leaf; Play this group', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives')
  await page.getByTestId('coll-view-parallelism').click()
  await expect(page).toHaveURL(/cview=par/)
  await expect(page.locator('[data-testid="par-grid"] [data-rank]')).toHaveCount(32)
  await expect(page.locator('[data-testid="par-table"] tr[data-dim="tp"]')).toContainText('NVLink (one server)')
  await expect(page.locator('[data-testid="par-table"] tr[data-dim="dp"]')).toContainText('one leaf (same rail)')
  await expect(page.getByTestId('par-lesson')).toContainText('TP stays in the NVLink domain')
  await page.getByTestId('par-dim-dp').click()
  await page.locator('[data-testid="par-grid"] [data-rank="11"]').click()
  await expect(page.locator('[data-testid="par-grid"] .in-group')).toHaveCount(4)
  await page.getByTestId('par-play').click()
  await expect(page.getByTestId('coll-scope')).toHaveValue('group')
  await expect(page.getByTestId('coll-step')).toHaveText('Step 0 of 6 · start')
  await expect(page.getByTestId('busbw-limit')).toHaveText('100.0 GB/s')
  await expect(page.getByTestId('breadcrumb')).toContainText('DP group 3 (4 GPUs)')
  await expect(page).toHaveURL(/coll=allreduce\.ring\.group\.0\.1g\.gdp3/)
  expect(errors).toEqual([])
})

test('the parallelism mapper says why a plan does not fit, and why PP has no Play', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&cview=par&par=4.8.1.1.2.1.tp')
  await expect(page.getByTestId('par-problem')).toContainText('but the job has 32 GPUs')
  await expect(page.locator('[data-testid="par-grid"]')).toHaveCount(0)
  await page.getByTestId('par-dp').selectOption('4')
  await expect(page.locator('[data-testid="par-grid"] [data-rank]')).toHaveCount(32)
  await page.getByTestId('par-dim-pp').click()
  await page.locator('[data-testid="par-grid"] [data-rank="0"]').click()
  await expect(page.getByTestId('par-play')).toBeDisabled()
  await expect(page.getByTestId('par-play-note')).toContainText('send and receive')
  await page.keyboard.press('ArrowRight') // the hidden collective stays at step 0
  await expect(page).toHaveURL(/coll=allreduce\.ring\.1n\.0\.1g/)
  expect(errors).toEqual([])
})

test('a group link opens: a TP group plays at the NVLink limit', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&par=4.8.1.1.4.1.tp&coll=allreduce.ring.group.0.1g.gtp2')
  await expect(page.getByTestId('coll-scope')).toHaveValue('group')
  await expect(page.getByTestId('busbw-limit')).toHaveText('900.0 GB/s')
  await expect(page.getByTestId('ring-diagram').locator('title').first()).toHaveText('Rank 0: su1-n03/gpu0')
  await expect(page.getByTestId('coll-notes')).toContainText('the same NVSwitch chips') // the notes of a ring in one server
  expect(errors).toEqual([])
})

test('the parallelism mapper marks a failed GPU of Simulate mode, and names its groups', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&cview=par&fail=su1-n02/gpu3:xid79')
  await expect(page.locator('[data-testid="par-grid"] [data-rank="11"]')).toHaveClass(/failed/)
  await expect(page.getByTestId('par-failures')).toContainText('su1-n02/gpu3 (rank 11)')
  await expect(page.getByTestId('par-failures')).toContainText('TP group 1')
  await expect(page.getByTestId('par-failures')).toContainText('DP group 3')
  await expect(page.getByTestId('par-failures')).toContainText('one lost GPU stops its groups')
  expect(errors).toEqual([])
})

for (const g of GUIDES) {
  test(`the guide "${g.title}" walks all its steps, with the targets and the checks`, async ({ page }) => {
    const { errors } = await open(page, '')
    await page.getByTestId('guides-open').click()
    await page.getByTestId(`guide-${g.id}`).click()
    for (let k = 1; k <= g.steps.length; k++) {
      const st = g.steps[k - 1]!
      await expect(page.getByTestId('guide-step')).toHaveText(`Step ${k} of ${g.steps.length}`)
      await expect(page).toHaveURL(new RegExp(`guide=${g.id}\\.${k}`))
      await expect(page.getByTestId('guide-again')).toHaveCount(0)
      if (st.target) await expect(page.getByTestId(st.target).first()).toBeVisible()
      for (const c of st.checks ?? []) await expect(page.getByTestId(c.testid).first()).toContainText(c.text)
      if (k < g.steps.length) await page.getByTestId('guide-next').click()
    }
    await expect(page.getByTestId('guide-next')).toHaveText('Finish')
    await page.getByTestId('guide-next').click()
    await expect(page.getByTestId('guide-card')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('a guide step: "Show this step again" after a change; the URL keeps the step; Close keeps the view', async ({ page }) => {
  const { errors } = await open(page, '')
  await page.getByRole('button', { name: 'Help' }).click()
  await expect(page.locator('#help-dialog')).toContainText('Start with Guides')
  await page.keyboard.press('Escape')
  await page.getByTestId('guides-open').click()
  await page.getByTestId('guide-collectives').click()
  await page.getByTestId('coll-play').click()
  await page.getByTestId('guide-next').click() // Next stops Play: the step of the guide stays
  await page.waitForTimeout(800)
  await expect(page.getByTestId('coll-step')).toContainText('Step 7 of 14')
  await expect(page.getByTestId('guide-back')).toBeEnabled()
  await page.getByTestId('guide-next').click()
  await expect(page.getByTestId('coll-step')).toContainText('Step 14 of 14')
  await page.getByTestId('coll-back').click() // a change of the step
  await expect(page.getByTestId('guide-again')).toBeVisible()
  await page.getByTestId('guide-again').click()
  await expect(page.getByTestId('coll-step')).toContainText('Step 14 of 14')
  await page.getByTestId('cfg-suCount').selectOption('2') // a change of the configuration
  await expect(page.getByTestId('guide-again')).toBeVisible()
  await page.getByTestId('guide-again').click()
  await expect(page).not.toHaveURL(/su=2/)
  await expect(page.getByTestId('coll-step')).toContainText('Step 14 of 14')
  await page.reload()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 3 of 6')
  await page.getByTestId('guide-close').click()
  await expect(page.getByTestId('guide-card')).toHaveCount(0)
  await expect(page.getByTestId('coll-step')).toContainText('Step 14 of 14')
  await expect(page).not.toHaveURL(/guide=/)
  expect(errors).toEqual([])
})

test('a guide reader step from a link asks to show the step again, and the button pastes the sample', async ({ page }) => {
  const { errors } = await open(page, '#mode=collectives&coll=allreduce.ring.2n.0.1g&guide=reader.1')
  await expect(page.getByTestId('guide-step')).toHaveText('Step 1 of 4')
  await expect(page.getByTestId('guide-again')).toBeVisible()
  await page.getByTestId('guide-again').click()
  await expect(page.getByTestId('nccl-marks')).toContainText('84 % of the limit')
  await expect(page.getByTestId('guide-again')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the last step of a guide offers the next guide', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&guide=simulate.7')
  await expect(page.getByTestId('guide-next-guide')).toContainText('Collectives basics')
  await page.getByTestId('guide-next-guide').click()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 1 of 6')
  await expect(page).toHaveURL(/guide=collectives\.1/)
  expect(errors).toEqual([])
})

test('the guide Back button opens the view of the step, also after a deeper view', async ({ page }) => {
  const { errors } = await open(page, '')
  await page.getByTestId('guides-open').click()
  await page.getByTestId('guide-first').click()
  await page.getByTestId('guide-next').click()
  await page.keyboard.press('5') // a rail: a change of the view
  await page.getByTestId('guide-next').click() // the node view: a deeper level
  await page.getByTestId('guide-back').click()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 2 of 8')
  await expect(page.getByTestId('guide-again')).toHaveCount(0)
  await expect(page).toHaveURL(/#sel=su1-leaf-r0&guide=first\.2$/)
  expect(errors).toEqual([])
})

test('the guide follows the browser Back and Forward buttons', async ({ page }) => {
  const { errors } = await open(page, '')
  await page.getByTestId('guides-open').click()
  await page.getByTestId('guide-first').click()
  await page.getByTestId('guide-next').click()
  await page.getByTestId('guide-next').click()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 3 of 8')
  await page.goBack()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 2 of 8')
  await expect(page.getByTestId('guide-again')).toHaveCount(0)
  await page.goForward()
  await expect(page.getByTestId('guide-step')).toHaveText('Step 3 of 8')
  await expect(page.getByTestId('guide-again')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a guide step brings its target into view, also below the fold of a panel', async ({ page }) => {
  const { errors } = await open(page, '')
  await page.getByTestId('guides-open').click()
  await page.getByTestId('guide-reader').click()
  await expect(page.getByTestId('nccl-chart')).toBeInViewport({ ratio: 0.5 })
  expect(errors).toEqual([])
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('the outline of a guide target does not pulse', async ({ page }) => {
    const { errors } = await open(page, '#mode=collectives&coll=allreduce.ring.1n.14.1g&guide=collectives.3')
    const target = page.getByTestId('busbw-limit')
    await expect(target).toBeVisible()
    expect(await target.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    expect(await target.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    expect(errors).toEqual([])
  })
})

test.describe('the guides after the final review', () => {
  test('Esc during a guide keeps the step of the card', async ({ page }) => {
    const { errors } = await open(page, '')
    await page.getByTestId('guides-open').click()
    await page.getByTestId('guide-first').click()
    for (let i = 0; i < 7; i++) await page.getByTestId('guide-next').click() // the last step, on the fabric
    await expect(page.getByTestId('guide-step')).toHaveText('Step 8 of 8')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('breadcrumb')).toHaveText('Factory')
    await expect(page.getByTestId('guide-step')).toHaveText('Step 8 of 8')
    expect(errors).toEqual([])
  })

  test('the browser Back does not bring back a closed guide, or a guide of another tour', async ({ page }) => {
    const { errors } = await open(page, '')
    await page.getByTestId('guides-open').click()
    await page.getByTestId('guide-first').click()
    await page.getByTestId('guide-next').click()
    await page.getByTestId('guide-next').click()
    await page.getByTestId('guide-close').click()
    await page.goBack()
    await expect(page.getByTestId('guide-card')).toHaveCount(0)
    await page.goForward()
    await page.getByTestId('guides-open').click()
    await page.getByTestId('guide-first').click()
    for (let i = 0; i < 4; i++) await page.getByTestId('guide-next').click()
    await page.getByTestId('guide-close').click()
    await page.getByTestId('guides-open').click()
    await page.getByTestId('guide-collectives').click()
    await page.goBack()
    await expect(page.getByTestId('guide-card')).toContainText('Collectives basics')
    expect(errors).toEqual([])
  })

  test('a reader step keeps the own output of the user, and pastes the sample only on request', async ({ page }) => {
    const { errors } = await open(page, '#mode=collectives&coll=allreduce.ring.2n.0.1g')
    await page.getByTestId('coll-reader').click()
    const own = ncclSample({ busbwPeak: 500 })
    await page.getByTestId('nccl-input').fill(own)
    await page.getByTestId('guides-open').click()
    await page.getByTestId('guide-reader').click()
    await expect(page.getByTestId('nccl-input')).toHaveValue(own)
    await expect(page.getByTestId('guide-again')).toContainText('Paste the sample')
    await page.getByTestId('guide-again').click()
    await expect(page.getByTestId('nccl-marks')).toContainText('84 % of the limit')
    for (let i = 0; i < 3; i++) await page.getByTestId('guide-next').click()
    await page.getByTestId('nccl-input').fill(own) // step 4: "paste your own output"
    await expect(page.getByTestId('guide-again')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('an open reader does not count outside Collectives mode', async ({ page }) => {
    const { errors } = await open(page, '')
    await page.getByTestId('guides-open').click()
    await page.getByTestId('guide-reader').click()
    await page.evaluate(() => (location.hash = 'guide=first.1'))
    await expect(page.getByTestId('guide-step')).toHaveText('Step 1 of 8')
    await expect(page.getByTestId('guide-again')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('the card does not cover the topo -m matrix', async ({ page }) => {
    const { errors } = await open(page, '#server=su1-n01&topo=1&guide=first.3')
    const card = (await page.getByTestId('guide-card').boundingBox())!
    const topo = (await page.getByTestId('topo').boundingBox())!
    expect(card.y + card.height).toBeLessThanOrEqual(topo.y)
    expect(errors).toEqual([])
  })
})

test('Diagnose mode shows the chain and the verdict of a saved incident', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&dv=chain&inc=xid79-multinode')
  await expect(page.getByTestId('diag-verdict')).toContainText('hardware: GPU')
  await expect(page.getByTestId('diag-terminal')).toHaveText('NODE_FAIL')
  await expect(page.getByTestId('diag-card')).toContainText('su1-n14')
  await expect(page.getByTestId('diag-row-1')).toContainText('Xid 79')
  await expect(page.getByTestId('diag-row-0')).toContainText('context or symptom')
  await expect(page.getByTestId('diag-row-1').getByRole('button', { name: 'RB-03' })).toHaveCount(1)
  expect(errors).toEqual([])
})

test('Diagnose mode says ambiguous when the evidence does not choose', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&dv=chain&inc=host-not-allocatable')
  await expect(page.getByTestId('diag-verdict')).toContainText('ambiguous')
  await expect(page.getByTestId('diag-settle')).toContainText('The next checks')
  await expect(page.getByTestId('diag-settle').getByRole('button', { name: 'RB-12' })).toBeVisible()
  await page.getByTestId('diag-incident').selectOption('exit-137')
  await expect(page.getByTestId('diag-verdict')).toContainText('unattributed')
  expect(errors).toEqual([])
})

test('Diagnose mode reads the failures of the simulator, and the bar switches the panel', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&fail=su1-n14%2Fgpu3:xid79')
  await expect(page.getByTestId('impact')).toBeVisible()
  await page.getByTestId('diag-view-chain').click()
  await expect(page).toHaveURL(/dv=chain/)
  await expect(page.getByTestId('diag-panel')).toContainText('The failures of the simulator')
  await expect(page.getByTestId('diag-verdict')).toContainText('hardware: GPU on su1-n14')
  await expect(page.getByTestId('diag-row-0')).toContainText('Xid 79: su1-n14/gpu3')
  expect(errors).toEqual([])
})

test('a runbook checklist ticks a step and exports the incident timeline', async ({ page }) => {
  const { errors } = await open(page, '#mode=simulate&dv=chain&inc=xid79-multinode')
  await page.getByTestId('diag-open-checklist').click()
  await expect(page.getByTestId('checklist-title')).toHaveText('RB-03 checklist')
  await expect(page.getByTestId('checklist-progress')).toHaveText('0 of 4 steps done.')
  await expect(page.getByTestId('check-step-2')).toContainText('L2: GPU and node software')
  await expect(page.getByTestId('check-step-4')).toContainText('Who runs it')
  await expect(page.getByTestId('check-step-4')).toContainText('The job owner agrees')
  await page.getByTestId('check-box-1').check()
  await expect(page.getByTestId('checklist-progress')).toHaveText('1 of 4 steps done.')
  await expect(page).toHaveURL(/ck=RB-03/)
  await expect(page).toHaveURL(/cd=RB-03.1/)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('checklist-export').click()])
  expect(download.suggestedFilename()).toBe('incident-xid79-multinode-rb-03-timeline.md')
  await page.getByTestId('checklist-close').click()
  await expect(page.getByTestId('checklist-title')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the port map switches to the discovery and names each difference', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-k1&face=front')
  await expect(page.getByTestId('portmap-source')).toHaveValue('design')
  await expect(page.getByTestId('portmap-diff')).toHaveCount(0)
  await page.getByTestId('portmap-source').selectOption('discovered')
  await expect(page).toHaveURL(/tsrc=discovered/)
  await expect(page.getByTestId('portmap-diff')).toContainText('3 of 32 cables differ: 1 missing, 2 moved.')
  await expect(page.getByTestId('portmap-diff-names')).toContainText('missing: su1-n01~r5')
  await expect(page.getByTestId('portmap-diff-su1-n01_port-c5')).toHaveText('missing')
  await expect(page.getByTestId('portmap-diff-su1-n02_port-c1')).toContainText('moved to su1-leaf-r2/p2')
  await expect(page.getByTestId('portmap-note')).toContainText('assumed')
  // The three cables of the difference are marked on the rack elevation.
  expect(Number(await page.getByTestId('canvas').getAttribute('data-failed-count'))).toBe(3)
  expect(errors).toEqual([])
})

test('the port map switches to the intent, and the CSV carries the difference', async ({ page }) => {
  const { errors } = await open(page, '#racks=1&rack=su1-k1&face=front&tsrc=intent')
  await expect(page.getByTestId('portmap-diff')).toContainText('2 of 32 cables differ: 1 missing, 1 wrong rail.')
  await expect(page.getByTestId('portmap-diff-names')).toContainText('wrong rail: su1-n02~r4')
  await expect(page.getByTestId('portmap-diff-su1-n02_port-c4')).toContainText('wrong rail rail 6')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('portmap-csv').click()])
  expect(download.suggestedFilename()).toBe('port-map-su1-k1-intent.csv')
  await page.getByTestId('portmap-source').selectOption('design')
  await expect(page.getByTestId('portmap-diff')).toHaveCount(0)
  expect(errors).toEqual([])
})

// Library mode has no canvas, so it waits for the reader and not for the graph.
async function openLibrary(page: Page, hash: string) {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  const remote = await watchRemote(page)
  await page.goto(`${APP}${hash}`)
  await expect(page.getByTestId('library')).toBeVisible()
  return { errors, remote }
}

test('Library mode reads a runbook of the repository inside the portal', async ({ page }) => {
  const { errors, remote } = await openLibrary(page, '#mode=library&doc=rb-03&sec=3-first-5-minutes')
  await expect(page.getByTestId('lib-title')).toHaveText('GPU ECC, Xid, thermal, power, and row remap')
  // The section of the link is below the sticky head of the reader, not under it.
  const at = await page.evaluate(() => {
    const head = document.querySelector('.lib-head')!.getBoundingClientRect().bottom
    const el = document.getElementById('3-first-5-minutes')!.getBoundingClientRect().top
    return { head, el }
  })
  expect(at.el).toBeGreaterThanOrEqual(at.head - 1)
  await expect(page.getByTestId('lib-body')).toContainText('nvidia-smi')
  // The YAML front matter and the role-path block of our programme do not reach the reader.
  await expect(page.getByTestId('lib-body')).not.toContainText('owner_layers')
  await expect(page.getByTestId('lib-body')).not.toContainText('Role paths')
  // No dead link: every link is a document of the portal or a vendor page.
  const dead = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="lib-body"] a')].map((a) => a.getAttribute('href') ?? '').filter((h) => !h.startsWith('#doc=') && !/^(https?:|mailto:)/.test(h)),
  )
  expect(dead).toEqual([])
  expect(remote).toEqual([])
  expect(errors).toEqual([])
})

test('the list opens a document, and the mode switch reaches the Library', async ({ page }) => {
  const { errors } = await openLibrary(page, '#mode=library')
  await page.getByTestId('lib-doc-hb-command-reference').click()
  await expect(page.getByTestId('lib-title')).toHaveText('Command reference')
  await expect(page).toHaveURL(/doc=hb-command-reference/)
  // The sections of the document are in the table of contents.
  await expect(page.getByTestId('lib-toc').locator('button').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('a link in the body opens another document, and the portal does not reload', async ({ page }) => {
  const { errors } = await openLibrary(page, '#mode=library&doc=hb-onsite-procedures')
  await page.evaluate(() => ((window as unknown as { __stay: boolean }).__stay = true))
  await page.locator('[data-testid="lib-body"] a[href="#doc=hb-runbook-catalogue"]').first().click()
  await expect(page.getByTestId('lib-title')).toHaveText('Runbook catalogue')
  await expect(page).toHaveURL(/doc=hb-runbook-catalogue/)
  // The same page: a marker of the window survives, so no navigation happened.
  expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true)
  expect(errors).toEqual([])
})

test('a Read from a panel goes back to the view that it left, with its selection and its tab', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05%2Fgpu2&itab=learn')
  await page.getByTestId('written-runbooks').getByRole('button', { name: /^RB-03:/ }).click()
  await expect(page.getByTestId('lib-title')).toHaveText('GPU ECC, Xid, thermal, power, and row remap')
  await expect(page).toHaveURL(/mode=library&doc=rb-03/)
  await page.getByTestId('lib-back').click()
  await expect(page.getByTestId('inspector-title')).toHaveText('GPU 2')
  await expect(page.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/server=su1-n05/)
  await expect(page).not.toHaveURL(/mode=library/)
  expect(errors).toEqual([])
})

test('a value from the site requirements is text, and its tooltip says where it comes from', async ({ page }) => {
  const { errors } = await open(page, '#su=1&server=su1-n05&sel=su1-n05%2Fgpu2&itab=owner')
  const fromSite = page.locator('span.unavailable[title="From the site requirements."]')
  await expect(fromSite.first()).toBeVisible()
  // It is not a link and not a Read: the portal does not carry the document that gives the value.
  await expect(fromSite.first()).not.toHaveAttribute('href', /./)
  expect(errors).toEqual([])
})

test('a vendor page is still a link that opens a tab', async ({ page }) => {
  const { errors } = await open(page, '#su=1&sel=su1-leaf-r3')
  await page.getByRole('tab', { name: 'Learn' }).click()
  // The only links left in a panel are the vendor pages.
  const links = page.getByRole('tabpanel').getByRole('link')
  expect(await links.count()).toBeGreaterThan(0)
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank')
    expect(await link.getAttribute('href')).toMatch(/^https:\/\//)
  }
  expect(errors).toEqual([])
})
