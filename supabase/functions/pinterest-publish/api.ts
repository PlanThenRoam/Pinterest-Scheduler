export async function pinterestRequest(path:string,init:RequestInit={}) {
 const token=Deno.env.get('PINTEREST_ACCESS_TOKEN');
 if(!token)throw new Error('Pinterest is not connected. An authorised Pinterest access token is required.');
 const response=await fetch('https://api.pinterest.com/v5'+path,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json',...init.headers},signal:AbortSignal.timeout(30000)});
 const data=await response.json();
 if(!response.ok)throw new Error(`Pinterest request failed (${response.status}). ${String(data.message||'Check the connection.').slice(0,180)}`);
 return data;
}
export async function listBoards(){
 const boards:any[]=[];let bookmark:string|undefined;
 do{const data=await pinterestRequest('/boards?page_size=100'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):''));boards.push(...(data.items||[]).map((b:any)=>({id:b.id,name:b.name,description:b.description||'',privacy:b.privacy})));bookmark=data.bookmark;if(boards.length>10000)throw new Error('Too many boards to retrieve safely.');}while(bookmark);
 return boards;
}
