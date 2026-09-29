import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Builds the 3D world: ground, lights, obstacles, target, fly mesh, trajectory line. */
export class WorldView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  flyGroup = new THREE.Group();
  targetMesh!: THREE.Mesh;
  targetGlow!: THREE.PointLight;
  trajLine!: THREE.Line;
  followFly = false;
  private wingL!: THREE.Mesh;
  private wingR!: THREE.Mesh;
  private t = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    this.camera.position.set(-14, 14, -16);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1, 0);

    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.Fog(0x05070c, 40, 110);

    const hemi = new THREE.HemisphereLight(0x8ea2ff, 0x0a0f1c, 0.7);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(12, 20, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -30;
    key.shadow.camera.right = 30;
    key.shadow.camera.top = 30;
    key.shadow.camera.bottom = -30;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x22d3ee, 0.5);
    rim.position.set(-10, 8, -12);
    this.scene.add(rim);

    // ground
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x11182b, roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(48, 24, 0x22d3ee, 0x1b2547);
    grid.position.y = 0.02;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(grid);

    // arena border
    const borderGeo = new THREE.BoxGeometry(46, 0.4, 0.6);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x1e2a4d, emissive: 0x0ea5e9, emissiveIntensity: 0.25 });
    const mkWall = (x: number, z: number, rotY: number) => {
      const w = new THREE.Mesh(borderGeo, borderMat);
      w.position.set(x, 0.2, z);
      w.rotation.y = rotY;
      this.scene.add(w);
    };
    mkWall(0, 23, 0); mkWall(0, -23, 0); mkWall(23, 0, Math.PI / 2); mkWall(-23, 0, Math.PI / 2);

    // obstacles: a few glowing pillars / rocks
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x1c2440, roughness: 0.6 });
    const obsGlow = new THREE.MeshStandardMaterial({ color: 0x0b1226, emissive: 0x4ade80, emissiveIntensity: 0.35 });
    const obstacles: Array<[number, number, number, number]> = [
      [-4, -2, 2.2, 3.2], [6, -6, 1.6, 2.4], [-2, 8, 1.2, 4.0], [2, 2, 0.9, 1.6]
    ];
    for (const [x, z, r, h] of obstacles) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 8), obsMat);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      const cap = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.06, 8, 24), obsGlow);
      cap.position.set(x, h + 0.05, z);
      cap.rotation.x = Math.PI / 2;
      this.scene.add(cap);
    }

    this.buildTarget();
    this.buildFly();
    this.buildTrajectory();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildTarget(): void {
    const geo = new THREE.IcosahedronGeometry(0.7, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xff9f1c,
      emissiveIntensity: 1.6,
      roughness: 0.3
    });
    this.targetMesh = new THREE.Mesh(geo, mat);
    this.targetMesh.position.set(10, 1.0, 8);
    this.targetMesh.castShadow = true;
    this.scene.add(this.targetMesh);
    this.targetGlow = new THREE.PointLight(0xffb703, 30, 18, 1.8);
    this.targetGlow.position.copy(this.targetMesh.position);
    this.scene.add(this.targetGlow);
    // pedestal ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.07, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb703, emissiveIntensity: 0.8 })
    );
    ring.position.set(10, 0.08, 8);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'target-ring';
    this.scene.add(ring);
  }

  private buildFly(): void {
    // stylized low-poly fly: body, head+eyes, wings, legs
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b3448, roughness: 0.5, metalness: 0.4 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x16a34a, emissiveIntensity: 0.35, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), bodyMat);
    body.scale.set(1, 0.8, 1.5);
    body.castShadow = true;
    this.flyGroup.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), bellyMat);
    belly.position.set(0, -0.18, 0.1);
    belly.scale.set(0.8, 0.5, 1.2);
    this.flyGroup.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bodyMat);
    head.position.set(0, 0.12, 0.85);
    head.castShadow = true;
    this.flyGroup.add(head);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xef233c, emissiveIntensity: 1.2 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), eyeMat);
      eye.position.set(0.2 * sx, 0.2, 0.95);
      this.flyGroup.add(eye);
    }
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const wingGeo = new THREE.PlaneGeometry(0.9, 0.5);
    this.wingL = new THREE.Mesh(wingGeo, wingMat);
    this.wingL.position.set(-0.5, 0.4, -0.1);
    this.wingL.rotation.set(-0.5, 0.3, 0.5);
    this.flyGroup.add(this.wingL);
    this.wingR = new THREE.Mesh(wingGeo, wingMat);
    this.wingR.position.set(0.5, 0.4, -0.1);
    this.wingR.rotation.set(-0.5, -0.3, -0.5);
    this.flyGroup.add(this.wingR);
    // sensor cone helper (subtle)
    const coneGeo = new THREE.ConeGeometry(2.2, 6, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0, 3.4);
    cone.name = 'sensor-cone';
    this.flyGroup.add(cone);
    this.scene.add(this.flyGroup);
  }

  private buildTrajectory(): void {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.1, 0)]);
    const mat = new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9 });
    this.trajLine = new THREE.Line(geo, mat);
    this.trajLine.frustumCulled = false;
    this.scene.add(this.trajLine);
  }

  updateTrajectory(points: Array<[number, number]>): void {
    const verts = points.map(([x, z]) => new THREE.Vector3(x, 0.12, z));
    this.trajLine.geometry.dispose();
    this.trajLine.geometry = new THREE.BufferGeometry().setFromPoints(verts.length ? verts : [new THREE.Vector3(0, 0.12, 0)]);
  }

  setTarget(x: number, z: number): void {
    this.targetMesh.position.set(x, 1.0, z);
    this.targetGlow.position.set(x, 1.0, z);
    const ring = this.scene.getObjectByName('target-ring');
    if (ring) ring.position.set(x, 0.08, z);
  }

  setFly(x: number, y: number, z: number, heading: number): void {
    this.flyGroup.position.set(x, y, z);
    this.flyGroup.rotation.y = heading;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(dt: number, followTarget?: { x: number; z: number }): void {
    this.t += dt;
    // animate target bob + glow pulse
    this.targetMesh.position.y = 1.0 + Math.sin(this.t * 2) * 0.15;
    this.targetMesh.rotation.y += dt * 1.2;
    this.targetGlow.intensity = 26 + Math.sin(this.t * 3) * 8;
    // wing flap
    const flap = Math.sin(this.t * 40) * 0.35;
    this.wingL.rotation.z = 0.5 + flap;
    this.wingR.rotation.z = -0.5 - flap;
    this.flyGroup.position.y = 1.0 + Math.sin(this.t * 3.2) * 0.06;

    if (this.followFly && followTarget) {
      const desired = new THREE.Vector3(followTarget.x - Math.sin(0) * 0, 9, followTarget.z - 10);
      // smooth follow: keep offset behind/above fly
      desired.set(followTarget.x - 6, 9, followTarget.z - 9);
      this.camera.position.lerp(desired, 0.04);
      this.controls.target.lerp(new THREE.Vector3(followTarget.x, 1, followTarget.z), 0.12);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
