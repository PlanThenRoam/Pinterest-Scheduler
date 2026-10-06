const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const context=vm.createContext({});
const source=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/etsy-publish/price-inventory.ts'),'utf8');
vm.runInContext(stripTypeScriptTypes(source.replace(/\bexport /g,'')),context);
const {preparePriceInventory,verifyPriceInventory}=context;
const plain=value=>JSON.parse(JSON.stringify(value));
function inventory(){return {products:[{product_id:123,sku:'PTR-YELLOWSTONE',is_deleted:false,offerings:[{offering_id:456,quantity:999,is_enabled:true,is_deleted:false,price:{amount:1499,divisor:100,currency_code:'GBP'},readiness_state_id:null}],property_values:[]}],price_on_property:[],quantity_on_property:[],sku_on_property:[],readiness_state_on_property:[],listing:null};}
function atPrice(price){const result=inventory();result.products[0].offerings[0].price.amount=Math.round(price*100);return result;}
test('price payload uses the documented inventory structure and preserves every existing editable value',()=>{
 const original=inventory(),saved=structuredClone(original);
 assert.deepEqual(plain(preparePriceInventory(original,14.99,7.99)),{products:[{sku:'PTR-YELLOWSTONE',property_values:[],offerings:[{price:7.99,quantity:999,is_enabled:true,readiness_state_id:null}]}],price_on_property:[],quantity_on_property:[],sku_on_property:[],readiness_state_on_property:[]});
 assert.deepEqual(original,saved);
});
test('no quantities, enabled state, SKU or processing-profile data are invented',()=>{
 const input=inventory();input.products[0].sku=null;Object.assign(input.products[0].offerings[0],{quantity:0,is_enabled:false,readiness_state_id:789});input.readiness_state_on_property=null;
 const payload=plain(preparePriceInventory(input,14.99,5.99));
 assert.deepEqual(payload.products[0],{sku:null,property_values:[],offerings:[{price:5.99,quantity:0,is_enabled:false,readiness_state_id:789}]});assert.equal(payload.readiness_state_on_property,null);
 for(const key of ['quantity','is_enabled','readiness_state_id']){const bad=inventory();delete bad.products[0].offerings[0][key];assert.throws(()=>preparePriceInventory(bad,14.99,5.99),/unavailable|invalid/);}
 const noSku=inventory();delete noSku.products[0].sku;assert.throws(()=>preparePriceInventory(noSku,14.99,5.99),/SKU/);
});
test('supported property values and controls round-trip while response-only metadata is omitted',()=>{
 const input=inventory();input.products[0].property_values=[{property_id:200,property_name:'Colour',scale_id:null,scale_name:null,value_ids:[12],values:['Blue'],value_pairs:[]}];for(const key of ['price_on_property','quantity_on_property','sku_on_property','readiness_state_on_property'])input[key]=[200];
 const payload=plain(preparePriceInventory(input,14.99,6.99));
 assert.deepEqual(payload.products[0].property_values,[{property_id:200,value_ids:[12],values:['Blue'],scale_id:null,property_name:'Colour'}]);
 for(const key of ['price_on_property','quantity_on_property','sku_on_property','readiness_state_on_property'])assert.deepEqual(payload[key],[200]);
});
test('missing, multiple, deleted or unsupported inventory is blocked before a payload is returned',()=>{
 const changes=[x=>delete x.products,x=>x.products=[],x=>x.products.push(structuredClone(x.products[0])),x=>x.products[0].offerings.push(structuredClone(x.products[0].offerings[0])),x=>x.products[0].is_deleted=true,x=>x.products[0].offerings[0].is_deleted=true,x=>x.products[0].offerings[0].new_mutable_field='unknown',x=>delete x.products[0].property_values,x=>delete x.price_on_property,x=>x.price_on_property=[200],x=>x.listing={listing_type:'physical'},x=>x.products[0].offerings[0].quantity=1.5,x=>x.products[0].offerings[0].is_enabled='true'];
 for(const change of changes){const input=inventory();change(input);assert.throws(()=>preparePriceInventory(input,14.99,5.99),/Safe Etsy price update/);}
 for(const value of [null,{},[],{products:null}])assert.throws(()=>preparePriceInventory(value,14.99,5.99),/Safe Etsy price update/);
});
test('invalid Money, stale original price, currency mismatches and overprecise requested prices fail closed',()=>{
 for(const price of [null,14.99,{amount:'1499',divisor:100,currency_code:'GBP'},{amount:1499,divisor:0,currency_code:'GBP'},{amount:1499,divisor:1000,currency_code:'GBP'},{amount:Infinity,divisor:100,currency_code:'GBP'},{amount:1499,divisor:100,currency_code:'USD'}]){const input=inventory();input.products[0].offerings[0].price=price;assert.throws(()=>preparePriceInventory(input,14.99,5.99),/Safe Etsy price update/);}
 for(const price of [0,-1,NaN,Infinity,'5.99',true,5.999])assert.throws(()=>preparePriceInventory(inventory(),14.99,price),/price must be/);
 assert.throws(()=>preparePriceInventory(inventory(),7.99,5.99),/changed since/);
 assert.throws(()=>preparePriceInventory(inventory(),14.99,5.99,'USD'),/only GBP/);
});
test('inventory verification accepts correct Money values and response-only ID changes',()=>{
 for(const price of [5.99,6.99,7.99]){const after=atPrice(price);after.products[0].product_id=321;after.products[0].offerings[0].offering_id=654;assert.equal(verifyPriceInventory(inventory(),after,price),true);}
});
test('verification catches ignored price writes and any changed preserved inventory value',()=>{
 assert.throws(()=>verifyPriceInventory(inventory(),inventory(),7.99),/readback differs/);
 const changes=[x=>x.products[0].sku='CHANGED',x=>x.products[0].offerings[0].quantity=998,x=>x.products[0].offerings[0].is_enabled=false,x=>x.products[0].offerings[0].readiness_state_id=789,x=>x.readiness_state_on_property=null,x=>x.products[0].offerings[0].price.currency_code='USD'];
 for(const change of changes){const after=atPrice(7.99);change(after);assert.throws(()=>verifyPriceInventory(inventory(),after,7.99),/readback differs|currency differs/);}
});
