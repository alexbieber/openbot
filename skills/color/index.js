const NAMED = { red:[255,0,0], green:[0,128,0], blue:[0,0,255], white:[255,255,255], black:[0,0,0], yellow:[255,255,0], cyan:[0,255,255], magenta:[255,0,255], orange:[255,165,0], purple:[128,0,128], pink:[255,192,203], gray:[128,128,128], grey:[128,128,128] };

function parseColor(input) {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  const hexM = s.match(/^#?([0-9a-f]{3,8})$/);
  if (hexM) {
    let h = hexM[1];
    if (h.length === 3) h = h.split('').map(x => x+x).join('');
    if (h.length === 6) return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  const rgbM = s.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
  if (rgbM) return [+rgbM[1], +rgbM[2], +rgbM[3]];
  const hslM = s.match(/hsl\(\s*(\d+),\s*(\d+)%?,\s*(\d+)%?\s*\)/);
  if (hslM) return hslToRgb(+hslM[1], +hslM[2]/100, +hslM[3]/100);
  return null;
}
function hslToRgb(h,s,l) { const a=s*Math.min(l,1-l); const f=n=>{const k=(n+h/30)%12; return l-a*Math.max(Math.min(k-3,9-k,1),-1);}; return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)]; }
function rgbToHsl([r,g,b]) { r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h,s,l=(mx+mn)/2; if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);h=(mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4)/6;} return [Math.round(h*360),Math.round(s*100),Math.round(l*100)]; }
function rgbToHex([r,g,b]) { return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function rgbToCmyk([r,g,b]) { const rp=r/255,gp=g/255,bp=b/255; const k=1-Math.max(rp,gp,bp); if(k===1)return[0,0,0,100]; return [Math.round((1-rp-k)/(1-k)*100),Math.round((1-gp-k)/(1-k)*100),Math.round((1-bp-k)/(1-k)*100),Math.round(k*100)]; }
function luminance([r,g,b]) { const f=x=>{const v=x/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); }
function wcagContrast(a,b) { const la=luminance(a),lb=luminance(b); const [hi,lo]=[Math.max(la,lb),Math.min(la,lb)]; return +((hi+0.05)/(lo+0.05)).toFixed(2); }

export default {
  name: 'color',
  async run({ action='convert', input, toFormat='all', with: withColor, ratio=0.5 }) {
    switch(action) {
      case 'convert': {
        const rgb = parseColor(input);
        if (!rgb) return { ok:false, error:`Cannot parse color: ${input}` };
        const [r,g,b] = rgb;
        const [h,s,l] = rgbToHsl(rgb);
        const [c,m,y,k] = rgbToCmyk(rgb);
        const sv = s>0?Math.round(((s/100)*(l<=50?l:100-l)+l)/100*100):0;
        const vv = Math.round(Math.max(r,g,b)/255*100);
        return { ok:true, input, hex:rgbToHex(rgb), rgb:`rgb(${r},${g},${b})`, hsl:`hsl(${h},${s}%,${l}%)`, hsv:`hsv(${h},${sv}%,${vv}%)`, cmyk:`cmyk(${c}%,${m}%,${y}%,${k}%)` };
      }
      case 'contrast': {
        const a=parseColor(input), b=parseColor(withColor);
        if(!a||!b) return { ok:false, error:'Two valid colors required' };
        const ratio=wcagContrast(a,b);
        return { ok:true, ratio, aa:ratio>=4.5, aaLarge:ratio>=3, aaa:ratio>=7 };
      }
      case 'mix': {
        const a=parseColor(input), b=parseColor(withColor);
        if(!a||!b) return { ok:false, error:'Two valid colors required' };
        const mixed=[Math.round(a[0]*(1-ratio)+b[0]*ratio),Math.round(a[1]*(1-ratio)+b[1]*ratio),Math.round(a[2]*(1-ratio)+b[2]*ratio)];
        return { ok:true, mixed:rgbToHex(mixed), rgb:`rgb(${mixed.join(',')})` };
      }
      case 'random': {
        const r=[Math.floor(Math.random()*256),Math.floor(Math.random()*256),Math.floor(Math.random()*256)];
        const [h,s,l]=rgbToHsl(r);
        return { ok:true, hex:rgbToHex(r), rgb:`rgb(${r.join(',')})`, hsl:`hsl(${h},${s}%,${l}%)` };
      }
      case 'palette': {
        const rgb=parseColor(input);
        if(!rgb) return { ok:false, error:`Cannot parse: ${input}` };
        const [h,s,l]=rgbToHsl(rgb);
        const shades=[10,20,30,40,50,60,70,80,90].map(lv=>rgbToHex(hslToRgb(h,s/100,lv/100)));
        const complementary=rgbToHex(hslToRgb((h+180)%360,s/100,l/100));
        return { ok:true, base:rgbToHex(rgb), shades, complementary };
      }
      default: return { ok:false, error:`Unknown action: ${action}` };
    }
  },
};
