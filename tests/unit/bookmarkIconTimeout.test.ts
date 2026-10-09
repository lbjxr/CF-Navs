// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte'
import { afterEach, expect, it, vi } from 'vitest'
import BookmarkIcon from '../../src/components/BookmarkIcon.svelte'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers()})
it('routes a visible native object image timeout through the existing error callback',async()=>{
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,right:40,top:0,bottom:40,x:0,y:0,width:40,height:40,toJSON:()=>({})})
  const onError=vi.fn(),view=render(BookmarkIcon,{title:'Fixture',iconUrl:'/api/icon/42?v=1',onError})
  await vi.advanceTimersByTimeAsync(10001)
  expect(onError).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(20000)
  expect(onError).toHaveBeenCalledOnce()
  await view.rerender({title:'Fixture',iconUrl:'data:image/svg+xml,%3Csvg/%3E',onError})
  await vi.advanceTimersByTimeAsync(10001)
  expect(onError).toHaveBeenCalledOnce()
})
