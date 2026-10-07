import {describe,expect,it} from 'vitest'
import {createCategoryRetryUrl} from '../../src/lib/categoryIconDisplay'
import {iconCacheKey} from '../../worker/lib/iconResponses'
describe('document-owned native category retries',()=>{
 const source='/api/category-icon/7?v=revision&cv=3&key=synthetic-grant'
 it('is stable in a document and distinct after navigation',()=>{const a=createCategoryRetryUrl(source,1,100000.5),b=createCategoryRetryUrl(source,1,100001);expect(a).toBe(createCategoryRetryUrl(source,1,100000.9));expect(a).not.toBe(b);expect(a).toContain(source+'&retry=1-');expect(createCategoryRetryUrl(source,2,100000.5)).not.toBe(a)})
 it('does not grow Worker cache identities or change version routing',()=>{const a=iconCacheKey(new Request('https://example.test'+createCategoryRetryUrl(source,1,100000))).url;const b=iconCacheKey(new Request('https://example.test'+createCategoryRetryUrl(source,2,200000))).url;expect(a).toBe(b);expect(new URL(a).searchParams.get('v')).toBe('revision')})
 it.each([0,-1,Infinity,NaN])('rejects invalid attempt %s',attempt=>{expect(()=>createCategoryRetryUrl(source,attempt,1000)).toThrow()})
 it.each([0,-1,Infinity,NaN])('rejects invalid document identity %s',origin=>{expect(()=>createCategoryRetryUrl(source,1,origin)).toThrow()})
 it('rejects non-proxy sources',()=>{expect(()=>createCategoryRetryUrl('https://example.test/a.svg',1,1000)).toThrow()})
})
