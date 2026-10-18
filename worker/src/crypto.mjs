const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const base64url = value => {
 const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
 return btoa([...bytes].map(n=>String.fromCharCode(n)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
export const fromBase64url = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));
export const randomToken = (bytes=32)=>base64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async value=>base64url(await crypto.subtle.digest("SHA-256",typeof value==="string"?encoder.encode(value):value));
const aesKey=async secret=>{
 const bytes=fromBase64url(secret);
 if(bytes.length!==32)throw Error("Invalid secret length");
 return crypto.subtle.importKey("raw",bytes,{name:"AES-GCM"},false,["encrypt","decrypt"]);
};
export const seal=async (text,secret)=>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const result=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(secret),encoder.encode(text));
 return "v1."+base64url(iv)+"."+base64url(result);
};
export const unseal=async (value,secret)=>{
 const [version,nonce,blob]=String(value).split(".");
 if(version!=="v1")throw Error("Invalid ciphertext version");
 return decoder.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64url(nonce)},await aesKey(secret),fromBase64url(blob)));
};
