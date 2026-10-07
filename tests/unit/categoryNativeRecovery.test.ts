// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render} from '@testing-library/svelte'
const state=vi.hoisted(()=>({active:true,url:'/api/category-icon/7?v=1',failed:vi.fn()}))
vi.mock('../../src/lib/trustedIconView',()=>({emptyTrustedIcon:{active:false,url:'',pending:false},createTrustedIconView:(publish:any)=>({set:()=>publish({active:state.active,url:state.url,pending:false}),failed:state.failed,destroy:()=>{}})}))
import CategoryIcon from '../../src/components/CategoryIcon.svelte'
let observers: Array<{callback:IntersectionObserverCallback,target?:Element}>
const image=()=>document.querySelector('[data-category-icon] img') as HTMLImageElement|null
function visible(img:HTMLImageElement){const observer=observers.find(o=>o.target===img);observer?.callback([{target:img,isIntersecting:true,intersectionRatio:1,boundingClientRect:{width:18,height:18}} as IntersectionObserverEntry],{} as IntersectionObserver)}
beforeEach(()=>{vi.useFakeTimers();state.active=true;state.url='/api/category-icon/7?v=1';state.failed.mockReset();observers=[];vi.spyOn(document,'hidden','get').mockReturnValue(false);vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');vi.spyOn(navigator,'onLine','get').mockReturnValue(true);vi.stubGlobal('IntersectionObserver',class{constructor(callback:IntersectionObserverCallback){observers.push({callback})}observe(target:Element){observers.at(-1)!.target=target}disconnect(){}})})
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('native category request recovery',()=>{
 it('recovers a visible native source without load/error even when the local-copy view is active',async()=>{
  render(CategoryIcon,{category:{id:7,title:'Synthetic',icon_display:'image',icon_revision:'sha256-'+'a'.repeat(64)}})
  const original=image()!;expect(original.getAttribute('loading')).toBe('lazy');visible(original)
  await vi.advanceTimersByTimeAsync(10000)
  expect(image()).toBeNull()
  await vi.advanceTimersByTimeAsync(1200)
  expect(image()!.getAttribute('src')).toBe('/api/category-icon/7?v=1&retry=1')
  expect(state.failed).not.toHaveBeenCalled()
 })
 it('does not wait indefinitely when the active native fallback emits an error',async()=>{
  render(CategoryIcon,{category:{id:7,title:'Synthetic',icon_display:'image'}})
  await fireEvent.error(image()!)
  await vi.advanceTimersByTimeAsync(1200)
  expect(image()!.getAttribute('src')).toContain('retry=1');expect(state.failed).not.toHaveBeenCalled()
 })
 it('keeps a successful retry URL and does not re-request the original stalled URL',async()=>{
  const r=render(CategoryIcon,{category:{id:7,title:'Synthetic',icon_display:'image'}})
  await fireEvent.error(image()!);await vi.advanceTimersByTimeAsync(1200)
  const recovered=image()!;Object.defineProperties(recovered,{complete:{value:true,configurable:true},naturalWidth:{value:18,configurable:true}})
  await fireEvent.load(recovered);await r.rerender({category:{id:7,title:'Changed title',icon_display:'image'}})
  expect(image()!.getAttribute('src')).toContain('retry=1')
 })
 it('leaves verified Blob failures to the trusted-copy owner',async()=>{
  state.url='blob:https://example.test/verified';render(CategoryIcon,{category:{id:7,title:'Synthetic',icon_display:'image'}})
  await fireEvent.error(image()!);expect(state.failed).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(60000);expect(image()!.getAttribute('src')).toBe(state.url)
 })
 it('bounds automatic native retries and permits a later online recovery event',async()=>{
  render(CategoryIcon,{category:{id:7,title:'Synthetic',icon_display:'image'}})
  for(const delay of [1200,4000,10000]){await fireEvent.error(image()!);await vi.advanceTimersByTimeAsync(delay)}
  await fireEvent.error(image()!);await vi.advanceTimersByTimeAsync(120000);expect(image()).toBeNull()
  window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(0);expect(image()!.getAttribute('src')).toContain('retry=4')
 })
})
