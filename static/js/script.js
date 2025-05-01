import { exportMolecule, importMolecule } from "./import-export.js";

const color = THREE.Color;
const vector = THREE.Vector3;

const canvasWidth = window.innerWidth;
const canvasHeight = window.innerHeight;

let isRotating = true;
let viewMode = "ball-stick";
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(
  75,
  canvasWidth / canvasHeight,
  0.1,
  1000
);
camera.position.z = 8;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});
renderer.setSize(canvasWidth, canvasHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

const pointLight1 = new THREE.PointLight(0xffffff, 0.6);
pointLight1.position.set(-5, -5, -5);
scene.add(pointLight1);

// raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.querySelector(".tooltip");

// load atom data
let atomData = {};
let moleculesData = {};
let atomsLoaded = false;
let moleculesLoaded = false;

const loadingElement = document.getElementById("loading");
loadingElement.style.display = "block";

// Fetch atom data
fetch("static/data/Atoms.json")
  .then((response) => response.json())
  .then((data) => {
    atomData = data.atoms.reduce((acc, atom) => {
      acc[atom.name] = atom;
      return acc;
    }, {});
    atomsLoaded = true;
    checkAllDataLoaded();
  })
  .catch((error) => {
    console.error("Error loading atom data:", error);
    loadingElement.textContent = "Error loading atom data";
  });

// Fetch molecule data from json
fetch("static/data/molecules.json")
  .then((response) => response.json())
  .then((data) => {
    moleculesData = data;
    moleculesLoaded = true;
    checkAllDataLoaded();
  })
  .catch((error) => {
    console.error("Error loading molecule data:", error);
    loadingElement.textContent = "Error loading molecule data";
  });

function checkAllDataLoaded() {
  if (atomsLoaded && moleculesLoaded) {
    loadingElement.style.display = "none";
    initializeMolecules();
  }
}

let molecules = [];
let currentSelectedMolecule = null;
const buttons = new Map();

function initializeMolecules() {
  // Create buttons for each molecule
  moleculesData.molecules.forEach((moleculeData, index) => {
    buttons.set(moleculeData.name, index);
  });

  // Create molecule objects
  molecules = moleculesData.molecules.map(
    (moleculeData) => new Molecule(moleculeData)
  );

  // Hide all molecules initially
  molecules.forEach((molecule) => {
    molecule.hide();
  });

  // Show first molecule
  currentSelectedMolecule = molecules[0];
  currentSelectedMolecule.show();
  document.getElementById("info").innerHTML =
    "<h1>" + moleculesData.molecules[0].name + "</h1><p>3D Visualization</p>";

  // start animation
  animate();
}

// classes for atoms and bonds in the molecule
class Atom {
  constructor(position, name, charge = "0") {
    const atom = atomData[name];
    if (!atom) {
      console.error(`Atom ${name} not found in data`);
      return;
    }

    const geometry = new THREE.SphereGeometry(atom.radius * 0.3, 32, 32);
    const material = new THREE.MeshPhysicalMaterial({
      color: atom.color,
      metalness: atom.metallic ? 0.8 : 0.1,
      roughness: atom.metallic ? 0.2 : 0.7,
      clearcoat: atom.metallic ? 0.8 : 0.3,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.0,
      wireframe: false,
    });

    this.atom = new THREE.Mesh(geometry, material);
    this.atom.castShadow = true;
    this.atom.receiveShadow = true;
    this.atom.userData = {
      name: name,
      fullName: atom.fullName,
      charge: charge,
      atomicNumber: atom.atomicNumber,
      atomicWeight: atom.atomicWeight,
      type: "atom",
      originalRadius: atom.radius,
    };
    this.atom.position.set(position.x, position.y, position.z);
  }

  getThreeJsHandle() {
    return this.atom;
  }

  position() {
    return this.atom.position;
  }
}

class Bond {
  static StartColor = new THREE.Color(0x666666);
  static EndColor = new THREE.Color(0x444444);

  constructor(atom1, atom2, isDouble = false) {
    const start = atom1.position(),
      end = atom2.position(),
      direction = new vector().subVectors(end, start),
      length = direction.length();

    const bonds = isDouble
      ? Bond.createDoubleBond(length, start, end, direction)
      : Bond.createSingleBond(length, start, end, direction);

    this.bondGroup = new THREE.Group();
    bonds.forEach((bond) => {
      this.bondGroup.add(bond);
    });
    this.bondGroup.castShadow = true;
    this.bondGroup.receiveShadow = true;
  }

  getThreeJsHandle() {
    return this.bondGroup;
  }

  static bondGeometry(radius, length) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 16, 8);
    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const y = positions[i * 3 + 1];
      const colour = new color().lerpColors(
        Bond.StartColor,
        Bond.EndColor,
        (y + length / 2) / length
      );
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  static bondMaterial() {
    return new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      metalness: 0.1,
      roughness: 0.5,
      clearcoat: 0.3,
      wireframe: false,
    });
  }

  static createDoubleBond(length, start, end, direction) {
    const offset = 0.12;
    const perpendicular = new vector(direction.y, -direction.x, 0)
      .normalize()
      .multiplyScalar(offset);

    const geometry = Bond.bondGeometry(0.04, length);

    const bond1 = new THREE.Mesh(geometry, Bond.bondMaterial());
    const bond2 = new THREE.Mesh(geometry.clone(), Bond.bondMaterial());

    bond1.position.copy(start).add(perpendicular);
    bond2.position.copy(start).sub(perpendicular);

    bond1.position.lerp(end.clone().add(perpendicular), 0.5);
    bond2.position.lerp(end.clone().sub(perpendicular), 0.5);

    bond1.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    bond2.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );

    return [bond1, bond2];
  }

  static createSingleBond(length, start, end, direction) {
    const geometry = Bond.bondGeometry(0.06, length);
    const bond = new THREE.Mesh(geometry, Bond.bondMaterial());
    bond.position.copy(start).lerp(end, 0.5);
    bond.quaternion.setFromUnitVectors(
      new vector(0, 1, 0),
      direction.normalize()
    );
    return [bond];
  }
}

class Molecule {
  constructor(moleculeData) {
    this.molecule = new THREE.Group();
    this.atoms = [];
    this.bonds = [];
    this.name = moleculeData.name;
    this.formula = moleculeData.formula;

    // Create all atoms first
    const atomObjects = [];
    moleculeData.atoms.forEach((atomData) => {
      const position = new THREE.Vector3(
        atomData.position.x,
        atomData.position.y,
        atomData.position.z
      );

      const atom = new Atom(position, atomData.type, atomData.charge);
      if (atom.atom) {
        this.addAtom(atom);
        atomObjects.push(atom);
      }
    });

    // Create bonds
    moleculeData.bonds.forEach((bondData) => {
      if (
        bondData.atom1Index >= 0 &&
        bondData.atom2Index >= 0 &&
        bondData.atom1Index < atomObjects.length &&
        bondData.atom2Index < atomObjects.length
      ) {
        const bond = new Bond(
          atomObjects[bondData.atom1Index],
          atomObjects[bondData.atom2Index],
          bondData.isDouble
        );
        this.addBond(bond);
      }
    });

    scene.add(this.molecule);
  }

  hide() {
    this.molecule.visible = false;
  }

  show() {
    this.molecule.visible = true;
  }

  addBond(bond) {
    this.molecule.add(bond.getThreeJsHandle());
    this.bonds.push(bond.getThreeJsHandle());
  }

  rotate(x, y, z) {
    this.molecule.rotation.set(x, y, z);
  }

  rotateX(delta) {
    this.molecule.rotation.x += delta;
  }

  rotateY(delta) {
    this.molecule.rotation.y += delta;
  }

  addAtom(atom) {
    this.molecule.add(atom.getThreeJsHandle());
    this.atoms.push(atom.getThreeJsHandle());
  }

  // solid/wireframe toggle
  setViewModeTo(mode) {
    viewMode = mode;
    this.atoms.forEach((atom) => {
      switch (mode) {
        case "ball-stick":
          atom.scale.setScalar(1);
          atom.material.wireframe = false;
          break;
        case "wireframe":
          atom.scale.setScalar(0.8);
          atom.material.wireframe = true;
          break;
      }
    });

    this.bonds.forEach((bondGroup) => {
      bondGroup.children.forEach((bond) => {
        bond.material.wireframe = mode === "wireframe";
        bond.material.opacity = mode === "wireframe" ? 0.7 : 1;
        bond.material.transparent = mode === "wireframe";
      });
    });
  }

  onMouseMove(event) {
    mouse.x = (event.clientX / canvasWidth) * 2 - 1;
    mouse.y = -(event.clientY / canvasHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(this.atoms);

    if (intersects.length > 0) {
      const atom = intersects[0].object;
      const userData = atom.userData;

      tooltip.style.display = "block";
      tooltip.style.left = event.clientX + 10 + "px";
      tooltip.style.top = event.clientY + 10 + "px";
      tooltip.innerHTML = `
          ${userData.fullName} (${userData.name})<br>
          Atomic Number: ${userData.atomicNumber}<br>
          Atomic Weight: ${userData.atomicWeight}<br>
          Charge: ${userData.charge}
      `;

      // highlight the atom
      atom.material.emissive.setHex(0x666666);
    } else {
      tooltip.style.display = "none";
      this.atoms.forEach((atom) => atom.material.emissive.setHex(0x000000));
    }
  }
}

function setMolecule(moleculeName) {
  molecules.forEach((molecule) => {
    molecule.hide();
  });

  const index = buttons.get(moleculeName);
  if (index !== undefined) {
    currentSelectedMolecule = molecules[index];
    currentSelectedMolecule.show();
    document.getElementById(
      "info"
    ).innerHTML = `<h1>${moleculeName}</h1><p>${currentSelectedMolecule.formula}</p>`;
  } else {
    console.error(`Molecule ${moleculeName} not found`);
  }
}

function onMouseMove(event) {
  if (currentSelectedMolecule) {
    currentSelectedMolecule.onMouseMove(event);
  }
}

function setViewMode(mode) {
  if (currentSelectedMolecule) {
    currentSelectedMolecule.setViewModeTo(mode);
  }
}

function toggleRotation() {
  isRotating = !isRotating;
}

function handleExportMolecule() {
  exportMolecule(currentSelectedMolecule);
}

function handleImportMolecule() {
  importMolecule(
    Atom,
    Bond,
    Molecule,
    molecules,
    buttons,
    scene,
    setMolecule,
    viewMode
  );
}

// make functions available globally
window.setMolecule = setMolecule;
window.setViewMode = setViewMode;
window.toggleRotation = toggleRotation;
window.exportMolecule = handleExportMolecule;
window.importMolecule = handleImportMolecule;

document.addEventListener("mousemove", onMouseMove);

let mouseDown = false,
  rightMouseDown = false,
  mouseX = 0,
  mouseY = 0;

document.addEventListener("mousedown", (e) => {
  if (e.button === 0) mouseDown = true;
  else if (e.button === 2) rightMouseDown = true;
  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
  else if (e.button === 2) rightMouseDown = false;
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("mousemove", (e) => {
  if (mouseDown && currentSelectedMolecule) {
    const deltaX = e.clientX - mouseX;
    const deltaY = e.clientY - mouseY;

    currentSelectedMolecule.molecule.rotateY(deltaX * 0.01);
    currentSelectedMolecule.rotateX(deltaY * 0.01);
  } else if (rightMouseDown) {
    const deltaX = e.clientX - mouseX;
    const deltaY = e.clientY - mouseY;

    camera.position.x -= deltaX * 0.01;
    camera.position.y += deltaY * 0.01;
  }

  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener("dblclick", () => {
  if (currentSelectedMolecule) {
    currentSelectedMolecule.rotate(0, 0, 0);
    camera.position.set(0, 0, 8);
  }
});

document.addEventListener("wheel", (e) => {
  camera.position.z += e.deltaY * 0.01;
  camera.position.z = Math.max(4, Math.min(camera.position.z, 20));
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // only rotate if molecule is selected
  if (currentSelectedMolecule && isRotating && !mouseDown && !rightMouseDown) {
    currentSelectedMolecule.rotateY(0.005);
  }

  renderer.render(scene, camera);
}
