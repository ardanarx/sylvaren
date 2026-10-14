import Phaser from 'phaser';
import './style.css';
import { supabase, isCloudConfigured } from './supabase';
import { loadSave, saveSave, type SaveData } from './save';

type Tool = 'hoe' | 'seed' | 'water' | 'hand';
type Crop = { stage: number; watered: boolean };
type TileData = { tilled?: boolean; crop?: Crop };
const TILE = 32;
const MAP_W = 36;
const MAP_H = 30;
const COLORS = {
  grass: 0x8dbb70, grass2: 0x91c176, grass3: 0x86b66b, darkGrass: 0x6c9a5c,
  soil: 0x9b704e, soilDark: 0x805b41, water: 0x72c6ce, waterLight: 0x9cdee0,
  wood: 0x9b7049, leaf: 0x4d8050, leaf2: 0x65975b, cream: 0xf6f0df,
};

let gameScene: FarmScene | undefined;
let toastTimer: number | undefined;
let currentTool: Tool = 'hoe';
let saveState: SaveData = defaultSave();

function defaultSave(): SaveData {
  return { version: 1, day: 1, coins: 120, seeds: 5, tomatoes: 0, wood: 0, stone: 0, plantedTotal: 0, tiles: {}, player: { x: 17 * TILE, y: 17 * TILE } };
}
function toast(message: string) {
  const el = document.querySelector<HTMLDivElement>('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1900);
}
function updateHUD() {
  const set = (id: string, value: string | number) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
  set('day-label', `Hari ${saveState.day} · ${saveState.day % 2 ? 'Pagi' : 'Cerah'}`);
  set('coin-label', saveState.coins);
  set('seed-count', saveState.seeds);
  set('tomato-count', saveState.tomatoes);
  set('wood-count', saveState.wood);
  set('stone-count', saveState.stone);
  set('inventory-count', `${4 + (saveState.tomatoes > 0 ? 1 : 0)} barang`);
  set('objective-progress', `${Math.min(3, saveState.plantedTotal)} / 3 tanaman`);
  set('objective-label', saveState.plantedTotal >= 3 ? 'Panen tomat pertamamu' : 'Tanam 3 benih');
  const status = isCloudConfigured ? 'Cloud save tersedia' : 'Local save';
  set('save-status', status);
  set('connection-label', isCloudConfigured ? 'Cloud save tersedia setelah login' : 'Progres tersimpan di perangkat ini');
}
function chooseTool(tool: Tool) {
  currentTool = tool;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(btn => btn.classList.toggle('selected', btn.dataset.tool === tool));
  const names: Record<Tool, string> = { hoe: 'Cangkul dipilih', seed: 'Benih tomat dipilih', water: 'Alat siram dipilih', hand: 'Tangan dipilih' };
  toast(names[tool]);
}
function persistLocal() { saveSave(saveState); updateHUD(); }
function getTileKey(x: number, y: number) { return `${x},${y}`; }

class FarmScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private mapLayer!: Phaser.GameObjects.Container;
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private decorLayer!: Phaser.GameObjects.Container;
  private cropLayer!: Phaser.GameObjects.Container;
  private playerSpeed = 145;
  private moving: Record<string, boolean> = {};
  private lastInteract = 0;
  private mapOffsetX = 0;
  private mapOffsetY = 0;
  private tileObjects = new Map<string, Phaser.GameObjects.GameObject[]>();

  constructor() { super('FarmScene'); }
  preload() { this.load.image('meadow-village', '/assets/meadow-village.png'); }
  create() {
    gameScene = this;
    this.cameras.main.setBackgroundColor('#8dbb70');
    this.mapLayer = this.add.container(0, 0);
    this.tileGraphics = this.add.graphics();
    this.mapLayer.add(this.tileGraphics);
    this.decorLayer = this.add.container(0, 0);
    this.cropLayer = this.add.container(0, 0);
    this.drawWorld();
    this.player = this.makePlayer(saveState.player.x, saveState.player.y);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(17, 19).setOffset(-8, -10).setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.setZoom(this.scale.width < 560 ? 1.15 : 1.45);
    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,FOUR,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-ONE', () => chooseTool('hoe'));
    this.input.keyboard!.on('keydown-TWO', () => chooseTool('seed'));
    this.input.keyboard!.on('keydown-THREE', () => chooseTool('water'));
    this.input.keyboard!.on('keydown-FOUR', () => chooseTool('hand'));
    this.input.keyboard!.on('keydown-SPACE', () => this.interact());
    this.input.keyboard!.on('keydown-E', () => this.interact());
    this.scale.on('resize', (size: Phaser.Structs.Size) => this.cameras.main.setZoom(size.width < 560 ? 1.15 : 1.45));
    this.drawCrops();
    updateHUD();
  }
  private rect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    g.fillStyle(color, alpha); g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  private drawWorld() {
    // Illustrated environment aligned to Sylvaren's supplied art direction.
    const backdrop = this.add.image(0, 0, 'meadow-village').setOrigin(0, 0);
    backdrop.setDisplaySize(MAP_W * TILE, MAP_H * TILE);
    this.children.sendToBack(backdrop);
    this.tileGraphics.setVisible(false);
    const g = this.tileGraphics;
    g.clear();
    return; // keep gameplay overlays (player, crops and interaction) above the illustrated map.
    
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      let color = ((x * 7 + y * 13) % 5 === 0) ? COLORS.grass2 : ((x + y) % 7 === 0 ? COLORS.grass3 : COLORS.grass);
      // Winding river on the eastern side.
      const riverX = 27 + Math.sin(y * 0.34) * 2.5;
      if (Math.abs(x - riverX) < 1.5 || (y > 19 && x > 23 && x < 32)) color = COLORS.water;
      this.rect(g, x * TILE, y * TILE, TILE, TILE, color);
      if ((x * 19 + y * 23) % 11 === 0 && color !== COLORS.water) {
        this.rect(g, x * TILE + 6, y * TILE + 8, 3, 3, 0xc7d98b);
        this.rect(g, x * TILE + 19, y * TILE + 22, 2, 2, 0xe8df9b);
      }
      if (color === COLORS.water && (x + y) % 3 === 0) this.rect(g, x * TILE + 5, y * TILE + 8, 12, 2, COLORS.waterLight, .75);
    }
    // Main dirt path.
    for (let x = 4; x < 28; x++) for (let dy = 0; dy < 2; dy++) {
      this.rect(g, x * TILE, 15 * TILE + dy * TILE, TILE, TILE, x % 3 === 0 ? 0xd9bd83 : 0xe2c990);
      this.rect(g, x * TILE + 7, 15 * TILE + dy * TILE + 8, 3, 3, 0xc5a66d);
    }
    for (let y = 8; y < 23; y++) for (let dx = 0; dx < 2; dx++) this.rect(g, (13 + dx) * TILE, y * TILE, TILE, TILE, 0xe0c58e);
    this.drawHouse(9 * TILE, 7 * TILE);
    this.drawWell(22 * TILE, 11 * TILE);
    this.drawFence(4 * TILE, 11 * TILE, 7, true);
    this.drawFence(4 * TILE, 11 * TILE, 6, false);
    this.drawGarden(5 * TILE, 18 * TILE);
    this.drawBridge(27 * TILE, 20 * TILE);
    // Tree line and scattered trees.
    const trees = [[3,4],[6,5],[16,3],[20,4],[25,5],[31,5],[33,10],[4,22],[10,24],[17,24],[22,26],[32,25],[7,27],[2,15],[30,15],[33,18],[18,10],[2,8],[29,3],[34,27]];
    trees.forEach(([x,y], i) => this.drawTree(x*TILE, y*TILE, i));
    // Bushes and flower clusters.
    for (let i=0;i<65;i++) {
      const x = ((i*37+11)%MAP_W)*TILE+8, y = ((i*19+5)%MAP_H)*TILE+8;
      if (Math.abs(x/TILE-17)<7 && Math.abs(y/TILE-17)<5) continue;
      if (Math.abs(x/TILE-27)<3) continue;
      const bush = this.add.graphics();
      const flower = i%3===0;
      bush.fillStyle(flower ? 0x719e59 : 0x6f9e5d); bush.fillRect(x,y,8,5);
      bush.fillStyle(flower ? [0xffe9a5,0xf3a9a4,0xf8f1dd][i%3] : 0x8fbc72); bush.fillRect(x+2,y-2,3,3);
      this.decorLayer.add(bush);
    }
    // Rock cluster by the river.
    [0,1,2].forEach(i => {
      const rock = this.add.graphics(); rock.fillStyle(0x8b9d8c); rock.fillPoints([{x:0,y:7},{x:6,y:0},{x:15,y:4},{x:18,y:11},{x:4,y:14}],true);
      rock.fillStyle(0xb5c1a5); rock.fillRect(6,3,5,2); rock.setPosition(25*TILE+i*15, 23*TILE+i%2*7); this.decorLayer.add(rock);
    });
  }
  private drawHouse(x: number, y: number) {
    const c = this.add.container(x,y), g = this.add.graphics();
    g.fillStyle(0x4b6244); g.fillRect(4,53,120,9);
    g.fillStyle(0xd5b78b); g.fillRect(15,20,98,47);
    g.fillStyle(0xf1dcb4); g.fillRect(22,24,84,40);
    g.fillStyle(0x9e694a); g.fillPoints([{x:3,y:25},{x:63,y:0},{x:125,y:25},{x:116,y:30},{x:63,y:10},{x:12,y:31}],true);
    g.fillStyle(0xb77b53); g.fillRect(15,20,98,8);
    for(let i=0;i<6;i++) { g.fillStyle(0xc58a5e);g.fillRect(19+i*16,25,2,36); }
    g.fillStyle(0x4d6b60);g.fillRect(29,34,16,16);g.fillRect(82,34,16,16);
    g.fillStyle(0xb5d7c3);g.fillRect(32,37,10,10);g.fillRect(85,37,10,10);
    g.fillStyle(0x6b4937);g.fillRect(55,42,18,25);g.fillStyle(0xe2c38b);g.fillRect(67,53,2,2);
    g.fillStyle(0x6e503d);g.fillRect(57,18,12,15);g.fillStyle(0xc8b39a);g.fillRect(60,13,7,5);
    c.add(g);this.decorLayer.add(c);
  }
  private drawWell(x:number,y:number) {
    const c=this.add.container(x,y),g=this.add.graphics();
    g.fillStyle(0x6e7659);g.fillRect(0,28,43,7);g.fillStyle(0xb9a17b);g.fillRect(5,13,33,20);g.fillStyle(0x647e6b);g.fillRect(10,18,23,10);g.fillStyle(0x8c6444);g.fillRect(4,5,4,21);g.fillRect(35,5,4,21);g.fillStyle(0xa77a4f);g.fillPoints([{x:0,y:7},{x:21,y:0},{x:43,y:7}],true);c.add(g);this.decorLayer.add(c);
  }
  private drawFence(x:number,y:number,n:number,horizontal:boolean) {
    const g=this.add.graphics();g.fillStyle(0x936c46);
    for(let i=0;i<=n;i++){if(horizontal)g.fillRect(x+i*TILE,y,4,23);else g.fillRect(x,y+i*TILE,23,4);}
    g.fillStyle(0xc49b66);
    if(horizontal){g.fillRect(x,y+5,n*TILE+4,4);g.fillRect(x,y+15,n*TILE+4,4);}else{g.fillRect(x+5,y,4,n*TILE+4);g.fillRect(x+15,y,4,n*TILE+4);}
    this.decorLayer.add(g);
  }
  private drawGarden(x:number,y:number) {
    const g=this.add.graphics();
    for(let r=0;r<3;r++)for(let c=0;c<4;c++){
      const xx=x+c*25, yy=y+r*23;
      g.fillStyle(0x7b9b5b);g.fillRect(xx,yy,22,20);
      g.fillStyle(0x9a704e);g.fillRect(xx+2,yy+3,18,14);
      g.fillStyle(0x5b8e4f);g.fillRect(xx+5,yy+5,5,6);g.fillRect(xx+12,yy+9,4,5);
    }this.decorLayer.add(g);
  }
  private drawBridge(x:number,y:number) {
    const g=this.add.graphics();g.fillStyle(0x795b40);g.fillRect(x,y,42,95);g.fillStyle(0xb88654);g.fillRect(x+3,y,36,95);
    for(let i=0;i<6;i++){g.fillStyle(i%2?0xd1a16b:0xc28d59);g.fillRect(x+3,y+i*15,36,11);}
    g.fillStyle(0x8a6041);g.fillRect(x-5,y,5,95);g.fillRect(x+39,y,5,95);this.decorLayer.add(g);
  }
  private drawTree(x:number,y:number,seed:number) {
    const c=this.add.container(x,y),g=this.add.graphics();
    g.fillStyle(0x5e7347);g.fillRect(13,22,9,23);g.fillStyle(0x876647);g.fillRect(16,25,5,20);
    const greens=[0x4d8050,0x5b9155,0x689d5c];g.fillStyle(greens[seed%3]);g.fillRect(0,7,34,25);g.fillRect(5,0,25,35);g.fillRect(-3,14,40,15);
    g.fillStyle(0x83b66c);g.fillRect(7,4,12,7);g.fillRect(22,13,7,6);g.fillStyle(0x3e7147);g.fillRect(4,25,9,4);
    c.add(g);this.decorLayer.add(c);
  }
  private makePlayer(x:number,y:number) {
    const c=this.add.container(x,y);
    const shadow=this.add.ellipse(0,10,19,8,0x344a34,.28);c.add(shadow);
    const g=this.add.graphics();
    // Small pixel adventurer, straw hat and teal outfit.
    g.fillStyle(0x4b5544);g.fillRect(-6,-7,12,13);
    g.fillStyle(0x5d8b87);g.fillRect(-6,-2,12,11);
    g.fillStyle(0xe9c89a);g.fillRect(-5,-13,10,11);g.fillStyle(0x5b4939);g.fillRect(-5,-14,10,3);
    g.fillStyle(0x7a583d);g.fillRect(-7,-17,14,4);g.fillStyle(0xd8ad6e);g.fillRect(-5,-23,10,7);g.fillStyle(0xecd093);g.fillRect(-9,-17,18,3);
    g.fillStyle(0x35473b);g.fillRect(-3,-9,2,2);g.fillRect(3,-9,2,2);
    g.fillStyle(0x806144);g.fillRect(-5,8,4,5);g.fillRect(2,8,4,5);
    c.add(g);return c;
  }
  private drawCrops() {
    this.cropLayer.removeAll(true);
    Object.entries(saveState.tiles).forEach(([key,data]) => {
      const [x,y]=key.split(',').map(Number), xx=x*TILE, yy=y*TILE;
      if (!data.tilled) return;
      const g=this.add.graphics();
      g.fillStyle(data.crop?.watered ? 0x654e3b : COLORS.soilDark);g.fillRect(xx+3,yy+3,TILE-6,TILE-6);
      g.fillStyle(data.crop?.watered ? 0x80674b : COLORS.soil);g.fillRect(xx+5,yy+5,TILE-10,TILE-10);
      for(let i=0;i<3;i++){g.fillStyle(0x624832);g.fillRect(xx+7,yy+9+i*6,TILE-14,2);}
      if(data.crop){
        const stage=data.crop.stage;
        g.fillStyle(stage>=3?0x3c7846:0x57964f);g.fillRect(xx+13,yy+18-stage*2,5,Math.min(10,stage*3+2));
        g.fillStyle(0x72ae61);g.fillRect(xx+8,yy+18-stage*2,7,4);g.fillRect(xx+16,yy+15-stage*2,7,4);
        if(stage>=3){g.fillStyle(0xd94e43);g.fillRect(xx+10,yy+9,6,6);g.fillRect(xx+19,yy+13,6,6);g.fillStyle(0xf4b19a);g.fillRect(xx+12,yy+10,2,2);}
      }
      this.cropLayer.add(g);
    });
  }
  private targetTile() {
    const body=this.player.body as Phaser.Physics.Arcade.Body;
    const vx=this.moving.left?-1:this.moving.right?1:0, vy=this.moving.up?-1:this.moving.down?1:0;
    let px=body.center.x, py=body.center.y;
    if(vx||vy){px+=vx*TILE*0.95;py+=vy*TILE*0.95;}
    else { const d=this.player.getData('facing') as string || 'down'; if(d==='up')py-=TILE;if(d==='down')py+=TILE;if(d==='left')px-=TILE;if(d==='right')px+=TILE; }
    return {x:Phaser.Math.Clamp(Math.floor(px/TILE),0,MAP_W-1),y:Phaser.Math.Clamp(Math.floor(py/TILE),0,MAP_H-1)};
  }
  interact() {
    const now=Date.now();if(now-this.lastInteract<230)return;this.lastInteract=now;
    const t=this.targetTile(), key=getTileKey(t.x,t.y);
    const tile=saveState.tiles[key] ?? {};
    if(currentTool==='hoe'){
      if(tile.crop){toast('Tanaman sudah tumbuh di sini.');return;}
      if(tile.tilled){toast('Tanah ini sudah dicangkul.');return;}
      saveState.tiles[key]={tilled:true};toast('Cuk! Tanah siap ditanami.');
    } else if(currentTool==='seed'){
      if(!tile.tilled){toast('Cangkul tanah terlebih dahulu.');return;}
      if(tile.crop){toast('Sudah ada tanaman di sini.');return;}
      if(saveState.seeds<=0){toast('Benih habis. Jual hasil panen untuk membeli lagi.');return;}
      tile.crop={stage:0,watered:false};saveState.tiles[key]=tile;saveState.seeds--;saveState.plantedTotal++;toast('Benih tomat ditanam 🌱');
    } else if(currentTool==='water'){
      if(!tile.crop){toast('Tidak ada tanaman untuk disiram.');return;}
      if(tile.crop.watered){toast('Tanaman ini sudah disiram hari ini.');return;}
      tile.crop.watered=true;toast('Byur! Tanaman disiram 💧');
    } else {
      if(tile.crop && tile.crop.stage>=3){
        delete tile.crop;saveState.tomatoes+=2;saveState.coins+=8;toast('Panen berhasil! +2 tomat, +8 koin 🍅');
      } else if(tile.crop){toast('Belum matang. Siram dan tunggu hari berikutnya.');return;}
      else if(this.nearTree(t.x,t.y)){saveState.wood+=1;toast('Mengumpulkan kayu +1 🪵');}
      else if((t.x>23&&t.x<28&&t.y>21)){saveState.stone+=1;toast('Mengumpulkan batu +1 🪨');}
      else {toast('Belum ada yang bisa diambil di sini.');return;}
    }
    this.drawCrops();persistLocal();
  }
  private nearTree(x:number,y:number){return [[3,4],[6,5],[16,3],[20,4],[25,5],[31,5],[33,10],[4,22],[10,24],[17,24],[22,26],[32,25],[7,27],[2,15],[30,15],[33,18],[18,10],[2,8],[29,3],[34,27]].some(([tx,ty])=>Math.abs(tx-x)<=1&&Math.abs(ty-y)<=1);}
  nextDay() {
    saveState.day++;
    Object.values(saveState.tiles).forEach(tile=>{if(tile.crop){if(tile.crop.watered)tile.crop.stage=Math.min(3,tile.crop.stage+1);tile.crop.watered=false;}});
    saveState.player={x:this.player.x,y:this.player.y};
    this.drawCrops();persistLocal();toast(`Hari ${saveState.day} dimulai. Tanamanmu bertumbuh!`);
  }
  async update(_time:number,delta:number) {
    const left=this.cursors.left.isDown||this.keys.A.isDown||this.moving.left;
    const right=this.cursors.right.isDown||this.keys.D.isDown||this.moving.right;
    const up=this.cursors.up.isDown||this.keys.W.isDown||this.moving.up;
    const down=this.cursors.down.isDown||this.keys.S.isDown||this.moving.down;
    const body=this.player.body as Phaser.Physics.Arcade.Body;
    let vx=(right?1:0)-(left?1:0),vy=(down?1:0)-(up?1:0);
    if(vx&&vy){vx*=.707;vy*=.707;}
    body.setVelocity(vx*this.playerSpeed,vy*this.playerSpeed);
    if(vx||vy){this.player.setData('facing',Math.abs(vx)>Math.abs(vy)?(vx>0?'right':'left'):(vy>0?'down':'up'));this.player.setDepth(this.player.y);}
    if(Math.floor(this.player.x/TILE)!==Math.floor(saveState.player.x/TILE)||Math.floor(this.player.y/TILE)!==Math.floor(saveState.player.y/TILE)){
      saveState.player={x:this.player.x,y:this.player.y};
    }
    // Decorative tree canopy is intentionally layered over terrain; player stays readable.
    if(delta>0 && !this.input.keyboard?.enabled) return;
  }
  setMove(direction:string,active:boolean){this.moving[direction]=active;}
  getSave(){saveState.player={x:this.player.x,y:this.player.y};return saveState;}
  destroyScene(){gameScene=undefined;}
}

async function cloudSave() {
  persistLocal();
  if(!supabase){toast('Tersimpan di perangkat ini. Isi .env untuk cloud save.');return;}
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){toast('Local save tersimpan. Login Supabase belum dibuat pada MVP ini.');return;}
  const {error}=await supabase.from('game_saves').upsert({user_id:user.id,save_data:saveState,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error){toast('Cloud save gagal; progres lokal tetap aman.');console.error(error);}else toast('Progres tersimpan ke cloud ☁');
}

async function boot() {
  saveState=loadSave() ?? defaultSave();
  const config: Phaser.Types.Core.GameConfig={
    type:Phaser.AUTO,parent:'game',width:960,height:720,
    backgroundColor:'#8dbb70',pixelArt:true,roundPixels:true,antialias:false,
    scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},
    physics:{default:'arcade',arcade:{debug:false}},
    scene:[FarmScene],
    render:{pixelArt:true,roundPixels:true},
  };
  new Phaser.Game(config);
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>chooseTool(btn.dataset.tool as Tool)));
  document.getElementById('save-button')?.addEventListener('click',()=>void cloudSave());
  document.getElementById('sleep-button')?.addEventListener('click',()=>gameScene?.nextDay());
  document.getElementById('reset-button')?.addEventListener('click',()=>{
    if(!confirm('Mulai game baru? Save lokal saat ini akan diganti.'))return;
    saveState=defaultSave();saveSave(saveState);location.reload();
  });
  document.getElementById('interact-touch')?.addEventListener('click',()=>gameScene?.interact());
  document.getElementById('tool-touch')?.addEventListener('click',()=>{
    const order:Tool[]=['hoe','seed','water','hand'];chooseTool(order[(order.indexOf(currentTool)+1)%order.length]);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(btn=>{
    const dir=btn.dataset.move!;
    const start=(e:Event)=>{e.preventDefault();gameScene?.setMove(dir,true);};
    const stop=(e:Event)=>{e.preventDefault();gameScene?.setMove(dir,false);};
    btn.addEventListener('pointerdown',start);btn.addEventListener('pointerup',stop);btn.addEventListener('pointerleave',stop);btn.addEventListener('pointercancel',stop);
  });
  updateHUD();
}
void boot();
