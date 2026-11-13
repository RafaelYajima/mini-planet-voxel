"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";

/* ═══════ TIPOS ═══════ */
interface Enemy {
  mesh: THREE.Mesh;
  hp: number;
  speed: number;
  alive: boolean;
}

interface Bullet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

/* ═══════ CONSTANTES ═══════ */
const GRAVITY = 25;
const JUMP_FORCE = 10;
const MOVE_SPEED = 14;
const MOUSE_SENS = 0.002;
const BULLET_SPEED = 80;
const FIRE_RATE = 0.15; // seconds between shots
const MAX_HP = 100;
const ARENA_SIZE = 50;

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [gameState, setGameState] = useState<"menu" | "playing" | "dead">("menu");
  const [wave, setWave] = useState(0);
  const [kills, setKills] = useState(0);
  const [hp, setHp] = useState(MAX_HP);
  const [ammo, setAmmo] = useState(30);

  const gameRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    enemies: Enemy[];
    bullets: Bullet[];
    keys: Record<string, boolean>;
    yaw: number;
    pitch: number;
    velocity: THREE.Vector3;
    onGround: boolean;
    lastShot: number;
    kills: number;
    hp: number;
    ammo: number;
    wave: number;
    waveTimer: number;
    gunMesh: THREE.Group;
    muzzleFlash: THREE.PointLight;
    crosshair: THREE.Mesh;
    running: boolean;
  } | null>(null);

  const startGame = useCallback(() => {
    setGameState("playing");
    setWave(1);
    setKills(0);
    setHp(MAX_HP);
    setAmmo(30);
    if (gameRef.current) {
      gameRef.current.kills = 0;
      gameRef.current.hp = MAX_HP;
      gameRef.current.ammo = 30;
      gameRef.current.wave = 1;
      gameRef.current.waveTimer = 0;
      gameRef.current.enemies.forEach(e => { e.alive = false; e.mesh.visible = false; });
      gameRef.current.camera.position.set(0, 2, 0);
      gameRef.current.yaw = 0;
      gameRef.current.pitch = 0;
      gameRef.current.velocity.set(0, 0, 0);
    }
    containerRef.current?.querySelector("canvas")?.requestPointerLock();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── RENDERER ──
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // ── SCENE ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1a1a2e");
    scene.fog = new THREE.Fog("#1a1a2e", 30, 80);

    // ── CAMERA ──
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 2, 0);

    // ── LIGHTS ──
    const ambient = new THREE.AmbientLight("#4a5568", 0.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fef3c7", 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    // ── ARENA ──
    // Chão
    const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2);
    const floorMat = new THREE.MeshStandardMaterial({ color: "#2d3748", roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes
    const wallMat = new THREE.MeshStandardMaterial({ color: "#4a5568", roughness: 0.8 });
    const wallPositions: [number, number, number, number][] = [
      [0, 5, -ARENA_SIZE, 0],
      [0, 5, ARENA_SIZE, 0],
      [ARENA_SIZE, 5, 0, Math.PI / 2],
      [-ARENA_SIZE, 5, 0, Math.PI / 2],
    ];
    wallPositions.forEach(([x, y, z, rot]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE * 2, 10, 1), wallMat);
      wall.position.set(x, y, z);
      wall.rotation.y = rot;
      wall.castShadow = true;
      scene.add(wall);
    });

    // Plataformas
    const platMat = new THREE.MeshStandardMaterial({ color: "#6366f1", roughness: 0.7 });
    const platforms = [
      { pos: [10, 2, -10], size: [6, 0.5, 6] },
      { pos: [-15, 4, 8], size: [8, 0.5, 4] },
      { pos: [0, 3, 15], size: [5, 0.5, 5] },
      { pos: [20, 1.5, 20], size: [4, 0.5, 8] },
      { pos: [-20, 3, -15], size: [10, 0.5, 3] },
    ];
    const platformMeshes: THREE.Mesh[] = [];
    platforms.forEach(({ pos, size }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), platMat);
      m.position.set(pos[0], pos[1], pos[2]);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      platformMeshes.push(m);
    });

    // ── GUN MODEL (viewport) ──
    const gunGroup = new THREE.Group();
    // Body
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: "#1f2937" })
    );
    gunGroup.add(gunBody);
    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: "#374151", metalness: 0.8 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.35;
    gunGroup.add(barrel);
    // Grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: "#92400e" })
    );
    grip.position.set(0, -0.08, 0.1);
    grip.rotation.x = 0.2;
    gunGroup.add(grip);

    gunGroup.position.set(0.25, -0.2, -0.5);
    camera.add(gunGroup);
    scene.add(camera);

    // Muzzle flash
    const muzzleFlash = new THREE.PointLight("#fbbf24", 0, 8);
    muzzleFlash.position.set(0, 0, -0.7);
    gunGroup.add(muzzleFlash);

    // ── ENEMIES ──
    const enemies: Enemy[] = [];
    const enemyGeo = new THREE.BoxGeometry(0.8, 1.6, 0.8);

    function spawnEnemy() {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random() * 0.1, 0.8, 0.5),
      });
      const mesh = new THREE.Mesh(enemyGeo, mat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 25;
      mesh.position.set(Math.cos(angle) * dist, 0.8, Math.sin(angle) * dist);
      mesh.castShadow = true;
      scene.add(mesh);
      enemies.push({ mesh, hp: 3, speed: 3 + Math.random() * 3, alive: true });
    }

    // ── BULLETS ──
    const bullets: Bullet[] = [];
    const bulletGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const bulletMat = new THREE.MeshBasicMaterial({ color: "#fbbf24" });

    // ── GAME STATE ──
    const keys: Record<string, boolean> = {};
    const state = {
      scene, camera, renderer, enemies, bullets, keys,
      yaw: 0, pitch: 0,
      velocity: new THREE.Vector3(),
      onGround: true,
      lastShot: 0,
      kills: 0, hp: MAX_HP, ammo: 30,
      wave: 1, waveTimer: 0,
      gunMesh: gunGroup,
      muzzleFlash,
      crosshair: new THREE.Mesh(),
      running: true,
    };
    gameRef.current = state;

    // ── INPUT ──
    const onKeyDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      state.yaw -= e.movementX * MOUSE_SENS;
      state.pitch -= e.movementY * MOUSE_SENS;
      state.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 3, state.pitch));
    };
    const onMouseDown = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onResize);

    // ── SHOOT ──
    function shoot() {
      if (state.ammo <= 0) return;
      const now = performance.now() / 1000;
      if (now - state.lastShot < FIRE_RATE) return;
      state.lastShot = now;
      state.ammo--;
      setAmmo(state.ammo);

      // Muzzle flash
      muzzleFlash.intensity = 3;
      setTimeout(() => { muzzleFlash.intensity = 0; }, 50);

      // Gun recoil
      gunGroup.position.z += 0.05;
      gunGroup.rotation.x -= 0.05;
      setTimeout(() => {
        gunGroup.position.z = -0.5;
        gunGroup.rotation.x = 0;
      }, 80);

      // Bullet
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const bullet = new THREE.Mesh(bulletGeo, bulletMat);
      bullet.position.copy(camera.position).add(dir.clone().multiplyScalar(0.5));
      scene.add(bullet);
      bullets.push({ mesh: bullet, velocity: dir.multiplyScalar(BULLET_SPEED), life: 2 });
    }

    // ── GAME LOOP ──
    let lastTime = performance.now();
    const clock = new THREE.Clock();

    function gameLoop() {
      if (!state.running) return;
      requestAnimationFrame(gameLoop);

      const delta = Math.min(clock.getDelta(), 0.05);
      const now = performance.now() / 1000;

      // Only update gameplay if playing
      if (gameRef.current && gameRef.current.hp > 0) {
        // ── MOVEMENT ──
        const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
        const right = new THREE.Vector3(-Math.cos(state.yaw), 0, Math.sin(state.yaw));
        const move = new THREE.Vector3();
        if (keys["w"]) move.add(forward);
        if (keys["s"]) move.sub(forward);
        if (keys["a"]) move.sub(right);
        if (keys["d"]) move.add(right);
        if (move.lengthSq() > 0) move.normalize().multiplyScalar(MOVE_SPEED * delta);

        // Gravity & Jump
        state.velocity.y -= GRAVITY * delta;
        if (keys[" "] && state.onGround) {
          state.velocity.y = JUMP_FORCE;
          state.onGround = false;
        }

        camera.position.add(move);
        camera.position.y += state.velocity.y * delta;

        // Floor collision
        if (camera.position.y <= 2) {
          camera.position.y = 2;
          state.velocity.y = 0;
          state.onGround = true;
        }

        // Platform collision
        platformMeshes.forEach(pm => {
          const b = new THREE.Box3().setFromObject(pm);
          const feet = camera.position.y - 1.8;
          const head = camera.position.y;
          if (camera.position.x > b.min.x && camera.position.x < b.max.x &&
              camera.position.z > b.min.z && camera.position.z < b.max.z) {
            if (feet <= b.max.y && feet >= b.min.y - 0.5 && state.velocity.y <= 0) {
              camera.position.y = b.max.y + 1.8;
              state.velocity.y = 0;
              state.onGround = true;
            }
          }
        });

        // Wall collision
        camera.position.x = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, camera.position.x));
        camera.position.z = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, camera.position.z));

        // Camera rotation
        camera.rotation.order = "YXZ";
        camera.rotation.y = state.yaw;
        camera.rotation.x = state.pitch;

        // Shoot
        if (keys["mousedown"] || (document.pointerLockElement === renderer.domElement && keys["click"])) {
          shoot();
        }

        // ── BULLETS ──
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));
          b.life -= delta;

          // Hit enemies
          for (const enemy of enemies) {
            if (!enemy.alive) continue;
            if (b.mesh.position.distanceTo(enemy.mesh.position) < 1) {
              enemy.hp--;
              if (enemy.hp <= 0) {
                enemy.alive = false;
                enemy.mesh.visible = false;
                state.kills++;
                setKills(state.kills);
                // Ammo pickup on kill
                state.ammo = Math.min(30, state.ammo + 5);
                setAmmo(state.ammo);
              }
              b.life = 0;
            }
          }

          if (b.life <= 0) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
          }
        }

        // ── ENEMIES ──
        let aliveCount = 0;
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          aliveCount++;
          const dir = camera.position.clone().sub(enemy.mesh.position);
          dir.y = 0;
          dir.normalize();
          enemy.mesh.position.add(dir.multiplyScalar(enemy.speed * delta));
          enemy.mesh.lookAt(camera.position.x, enemy.mesh.position.y, camera.position.z);

          // Damage player
          if (enemy.mesh.position.distanceTo(camera.position) < 1.5) {
            state.hp -= 15 * delta;
            setHp(Math.max(0, Math.round(state.hp)));
            if (state.hp <= 0) {
              setGameState("dead");
            }
          }
        }

        // ── WAVES ──
        if (aliveCount === 0) {
          state.waveTimer += delta;
          if (state.waveTimer > 3) {
            state.wave++;
            setWave(state.wave);
            state.waveTimer = 0;
            const count = 3 + state.wave * 2;
            for (let i = 0; i < count; i++) spawnEnemy();
            state.ammo = 30;
            setAmmo(30);
          }
        }
      }

      renderer.render(scene, camera);
    }

    // Shooting via mousedown
    const onShootDown = () => { keys["mousedown"] = true; };
    const onShootUp = () => { keys["mousedown"] = false; };
    renderer.domElement.addEventListener("mousedown", onShootDown);
    renderer.domElement.addEventListener("mouseup", onShootUp);

    gameLoop();

    return () => {
      state.running = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("mousedown", onShootDown);
      renderer.domElement.removeEventListener("mouseup", onShootUp);
      window.removeEventListener("resize", onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0">
      {/* CROSSHAIR */}
      {gameState === "playing" && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-10">
          <div className="w-1 h-6 bg-white/60 absolute" />
          <div className="w-6 h-1 bg-white/60 absolute" />
        </div>
      )}

      {/* HUD */}
      {gameState === "playing" && (
        <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-10 flex items-end justify-between p-6">
          {/* HP */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">HP</span>
            <div className="w-40 h-3 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${hp}%` }} />
            </div>
            <span className="text-lg font-black text-white">{hp}</span>
          </div>

          {/* Wave & Kills */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Wave {wave}</span>
            <span className="text-3xl font-black text-white">{kills}</span>
            <span className="text-[10px] text-slate-400">KILLS</span>
          </div>

          {/* Ammo */}
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">AMMO</span>
            <span className="text-3xl font-black text-white">{ammo}</span>
          </div>
        </div>
      )}

      {/* MENU */}
      {gameState === "menu" && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/90">
          <div className="text-center">
            <h1 className="text-5xl font-black tracking-tight text-white mb-2">MINI-PLANET</h1>
            <p className="text-xl font-bold text-violet-400 mb-8">SHOOTER</p>
            <button onClick={startGame}
              className="px-10 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold text-lg rounded-2xl transition shadow-2xl shadow-violet-600/30">
              START GAME
            </button>
            <p className="mt-6 text-xs text-slate-500">WASD to move · Mouse to aim · Click to shoot · Space to jump</p>
          </div>
        </div>
      )}

      {/* DEATH SCREEN */}
      {gameState === "dead" && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-red-950/80">
          <div className="text-center">
            <h2 className="text-4xl font-black text-red-400 mb-4">YOU DIED</h2>
            <p className="text-lg text-white mb-2">Wave {wave} · {kills} Kills</p>
            <button onClick={startGame}
              className="mt-6 px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl transition">
              TRY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
