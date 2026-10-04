<script lang="ts">
  import { ICON_LOCAL_COPY_ENABLED, iconDevice, type IconDevicePhase } from '../lib/iconDeviceState'
  import { ICON_COPY_BODY_BUDGET } from '../../shared/iconLocalCopy'
  const phaseText: Record<IconDevicePhase, string> = {
    disabled: '未启用', 'waiting-auth': '等待有效的登录校验', checking: '正在检查此设备的副本', ready: '已启用',
    expired: '离线期限已到期，联网校验后可恢复', unsupported: '当前服务端不支持本地副本', unavailable: '存储不可用', 'cleanup-failed': '清理未完成',
  }
  export let onVerify: (() => Promise<void>) | undefined = undefined
  let busy = false
  let localError = ''
  async function act(operation: () => Promise<void>) {
    busy = true; localError = ''
    try { await operation() } catch { localError = '操作未完成，请检查网络或浏览器存储权限后重试。' } finally { busy = false }
  }
  const toggle = (enabled: boolean) => act(async () => { await iconDevice.setTrusted(enabled); if (enabled && iconDevice.snapshot().phase !== 'ready') await onVerify?.() })
  const clear = () => act(() => iconDevice.clearCopies())
  const verify = () => act(async () => { await onVerify?.(); await iconDevice.resume() })
  const size = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2) + ' MiB'
</script>

{#if ICON_LOCAL_COPY_ENABLED}
<section class="device-cache" aria-labelledby="device-cache-title">
  <div class="device-heading"><div><h3 id="device-cache-title">此设备的图标副本</h3><p>只影响此浏览器，不随全站设置保存或备份。</p></div><span class="device-tag">本机</span></div>
  <label class="trust-choice"><input type="checkbox" checked={$iconDevice.trusted} disabled={busy} on:change={(event) => toggle(event.currentTarget.checked)} /><span>在此设备保留书签图标</span></label>
  <p class="privacy-note">可能包含当前登录范围内的私密图片。副本保存在此设备上，并非加密保险箱；共用电脑请勿启用。断网时无法立即获知远端撤回，离线最长 24 小时且不晚于会话到期。</p>
  <dl><div><dt>有效条目</dt><dd>{$iconDevice.stats.entries} / 1,000</dd></div><div><dt>图片正文</dt><dd>{size($iconDevice.stats.bodyBytes)} / {size(ICON_COPY_BODY_BUDGET)}</dd></div><div><dt>最近成功校验</dt><dd>{$iconDevice.checkedAt ? new Date($iconDevice.checkedAt).toLocaleString() : '尚未校验'}</dd></div></dl>
  <p class="device-status" role="status" aria-live="polite">{phaseText[$iconDevice.phase]}{#if $iconDevice.error}：{$iconDevice.error}{/if}{#if localError}：{localError}{/if}</p>
  <div class="device-actions"><button type="button" disabled={busy || !onVerify} on:click={verify}>联网校验</button><button type="button" disabled={busy} on:click={clear}>清理此设备图标副本</button><button type="button" disabled={busy || !$iconDevice.trusted} on:click={() => toggle(false)}>关闭并清理</button></div>
  <p class="device-footnote">只清理本机副本，不删除云端书签或图片；之后仅按需恢复当前使用的图标。</p>
</section>
{/if}

<style>
  .device-cache { border: 1px solid var(--sp-group-border); background: var(--sp-group-bg); border-radius: 16px; padding: 22px; color: var(--sp-text); }
  .device-heading { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
  h3 { margin: 0 0 8px; color: var(--sp-heading); font-size: 17px; }
  p { color: var(--sp-muted); line-height: 1.65; font-size: 13px; margin: 6px 0 16px; }
  .device-tag { border: 1px solid var(--sp-border); border-radius: 6px; padding: 3px 8px; white-space: nowrap; font-size: 12px; }
  .trust-choice { display: flex; align-items: center; gap: 10px; font-weight: 600; margin: 20px 0 10px; cursor: pointer; }
  input { width: 18px; height: 18px; accent-color: var(--sp-accent); }
  .privacy-note { border-left: 3px solid var(--sp-accent); padding-left: 12px; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 22px 0; }
  dt { color: var(--sp-muted); font-size: 12px; margin-bottom: 6px; }
  dd { margin: 0; font-variant-numeric: tabular-nums; font-size: 14px; overflow-wrap: anywhere; }
  .device-status { color: var(--sp-text); }
  .device-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  button { border: 1px solid var(--sp-border); background: var(--sp-input-bg); color: var(--sp-text); padding: 10px 14px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 3px; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .device-footnote { margin: 14px 0 0; }
  @media (max-width: 600px) { .device-cache { padding: 16px; } .device-actions button { width: 100%; } }
</style>
