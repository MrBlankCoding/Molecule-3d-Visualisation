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

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.querySelector(".tooltip");

class Atom {
  constructor(
    position,
    color,
    radius,
    metallic = false,
    name = "",
    properties = {}
  ) {
    const geometry = new THREE.SphereGeometry(radius * 0.75, 32, 32);
    const material = new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: metallic ? 0.8 : 0.1,
      roughness: metallic ? 0.2 : 0.7,
      clearcoat: metallic ? 0.8 : 0.3,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.0,
      wireframe: false,
    });
    this.atom = new THREE.Mesh(geometry, material);
    this.atom.castShadow = true;
    this.atom.receiveShadow = true;
    this.atom.userData = {
      ...properties,
      name,
      type: "atom",
      originalRadius: radius,
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
  constructor() {
    this.molecule = new THREE.Group();
    this.atoms = [];
    this.bonds = [];
    scene.add(this.molecule);
  }

  hide() {
    for (let i = 0, n = this.bonds.length; i < n; i++)
      this.bonds[i].visible = false;
    for (let i = 0, n = this.atoms.length; i < n; i++)
      this.atoms[i].visible = false;
  }

  show() {
    for (let i = 0, n = this.bonds.length; i < n; i++)
      this.bonds[i].visible = true;
    for (let i = 0, n = this.atoms.length; i < n; i++)
      this.atoms[i].visible = true;
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

  // Toggle between solid and wireframe rendering of atoms
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
        // Adjust bond visibility in wireframe mode
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

      // Highlight atom
      atom.material.emissive.setHex(0x666666);
    } else {
      tooltip.style.display = "none";
      this.atoms.forEach((atom) => atom.material.emissive.setHex(0x000000));
    }
  }
}

class Sodium extends Atom {
  constructor(position, charge = "+1") {
    super(position, 0x9933ff, 1.02, true, "Na⁺", {
      fullName: "Sodium",
      charge: charge,
      atomicNumber: 11,
      atomicWeight: "22.99 g/mol",
    });
  }
}

class Carbon extends Atom {
  constructor(position, charge = "0") {
    super(position, 0x808080, 0.7, false, "C", {
      fullName: "Carbon",
      charge: charge,
      atomicNumber: 6,
      atomicWeight: "12.01 g/mol",
    });
  }
}

class Oxygen extends Atom {
  constructor(position, charge = "0") {
    super(position, 0xff0000, 0.6, false, "O", {
      fullName: "Oxygen",
      charge: charge,
      atomicNumber: 8,
      atomicWeight: "16.00 g/mol",
    });
  }
}

class Hydrogen extends Atom {
  constructor(position, charge = "0") {
    super(position, 0xffffff, 0.25, false, "H", {
      fullName: "Hydrogen",
      charge: charge,
      atomicNumber: 1,
      atomicWeight: "1.008 g/mol",
    });
  }
}

class Nitrogen extends Atom {
  constructor(position, charge = "0") {
    super(position, 0x00ff00, 0.7, false, "N", {
      fullName: "Nitrogen",
      charge: charge,
      atomicNumber: 7,
      atomicWeight: "14.0067 g/mol",
    });
  }
}

class Methane extends Molecule {
  constructor() {
    super();
    const sin_phi = 1 / 3,
      cos_phi = (2 * Math.sqrt(2)) / 3;

    const positions = [new vector(0, 1, 0).multiplyScalar(1.5)];
    const atoms = [];
    positions.push(new vector(cos_phi, -sin_phi, 0).multiplyScalar(1.5));
    positions.push(
      new vector(
        -cos_phi / 2,
        -sin_phi,
        (Math.sqrt(3) / 2) * cos_phi
      ).multiplyScalar(1.5)
    );
    positions.push(
      new vector(
        -cos_phi / 2,
        -sin_phi,
        (-Math.sqrt(3) / 2) * cos_phi
      ).multiplyScalar(1.5)
    );
    for (let index = 0; index < positions.length; index++)
      atoms.push(new Hydrogen(positions[index]));

    const carbonAtom = new Carbon(new vector(0, 0, 0));
    for (let index = 0, n = atoms.length; index < n; index++) {
      this.addBond(new Bond(atoms[index], carbonAtom));
      this.addAtom(atoms[index]);
    }
    this.addAtom(carbonAtom);
  }
}

class Water extends Molecule {
  constructor() {
    super();
    const phi_hydrogen = (Math.PI * 104.5) / 180 / 2,
      sin_phi = Math.sin(phi_hydrogen),
      cos_phi = Math.cos(phi_hydrogen);

    const atoms = [];
    atoms.push(
      new Hydrogen(new vector(0, cos_phi, sin_phi).multiplyScalar(1.5))
    );
    atoms.push(
      new Hydrogen(new vector(0, cos_phi, -sin_phi).multiplyScalar(1.5))
    );
    atoms.push(new Oxygen(new vector(0, 0, 0)));
    atoms.forEach((atom) => {
      this.addAtom(atom);
    });

    this.addBond(new Bond(atoms[2], atoms[0]));
    this.addBond(new Bond(atoms[2], atoms[1]));
  }
}

class SodiumBicarbonate extends Molecule {
  constructor() {
    super();
    const sodium = new Sodium(new vector(-3.0, -0.675, 0));
    const carbon = new Carbon(new vector(0, 0, 0));
    const oxygen1 = new Oxygen(new vector(0, 1.23, 0));
    const oxygen2 = new Oxygen(new vector(-1.17, -0.675, 0), "-1");
    const oxygen3 = new Oxygen(new vector(1.17, -0.675, 0));
    const hydrogen = new Hydrogen(new vector(1.8, -1.1, 0));

    const atoms = [sodium, carbon, oxygen1, oxygen2, oxygen3, hydrogen];
    atoms.forEach((atom) => this.addAtom(atom));

    const bonds = [
      new Bond(carbon, oxygen1, true),
      new Bond(carbon, oxygen2),
      new Bond(carbon, oxygen3),
      new Bond(oxygen3, hydrogen),
      new Bond(sodium, oxygen2),
    ];
    bonds.forEach((bond) => this.addBond(bond));
  }
}

class Ethanol extends Molecule {
  constructor() {
    super();

    const atoms = [];
    const hydrogen_positions = [
      new vector(1, -0.5, -0.5).multiplyScalar(1.5),
      new vector(1, -0.5, 0.5).multiplyScalar(1.5),
      new vector(-1.25, 0.5, -0.5).multiplyScalar(1.5),
      new vector(-1.25, 0.5, 0.5).multiplyScalar(1.5),
      new vector(-1.1, -0.5, 0).multiplyScalar(1.5),
      new vector(1.75, 0.75, 0).multiplyScalar(1.5),
    ];
    for (let index = 0; index < hydrogen_positions.length; index++)
      atoms.push(new Hydrogen(hydrogen_positions[index]));

    const carbonAtom1 = new Carbon(new vector(0.5, 0, 0).multiplyScalar(1.5));
    const carbonAtom2 = new Carbon(new vector(-0.5, 0, 0).multiplyScalar(1.5));
    atoms.push(carbonAtom1);
    atoms.push(carbonAtom2);
    this.addBond(new Bond(carbonAtom1, carbonAtom2));

    for (let index = 0; index < hydrogen_positions.length - 1; index++) {
      const carbonAtom = index === 0 || index === 1 ? carbonAtom1 : carbonAtom2;
      this.addBond(new Bond(carbonAtom, atoms[index]));
    }

    const oxygenAtom = new Oxygen(new vector(1, 1, 0).multiplyScalar(1.5));
    atoms.push(oxygenAtom);

    this.addBond(new Bond(atoms[5], oxygenAtom));
    this.addBond(new Bond(carbonAtom1, oxygenAtom));

    atoms.forEach((atom) => {
      this.addAtom(atom);
    });
  }
}

class Lactate extends Molecule {
  constructor() {
    super();
    const sqrt3 = Math.sqrt(3),
      sqrt3h = sqrt3 / 2,
      sin_phi = 1 / 3,
      cos_phi = (2 * Math.sqrt(2)) / 3,
      carbonPositions = [
        new vector(-1, 0, 0).multiplyScalar(1.5),
        new vector(0, 0, 0),
        new vector(sin_phi, -cos_phi / 2, -sqrt3h * cos_phi).multiplyScalar(
          1.5
        ),
      ],
      carbonAtoms = [];

    for (let index = 0; index < carbonPositions.length; index++)
      carbonAtoms.push(new Carbon(carbonPositions[index]));

    const hydrogenPositions = [
      new vector(-1 - sin_phi, -cos_phi, 0).multiplyScalar(1.5),
      new vector(-1 - sin_phi, cos_phi / 2, sqrt3h * cos_phi).multiplyScalar(
        1.5
      ),
      new vector(-1 - sin_phi, cos_phi / 2, -sqrt3h * cos_phi).multiplyScalar(
        1.5
      ),
      new vector(sin_phi, -cos_phi / 2, 0 + sqrt3h * cos_phi).multiplyScalar(
        1.5
      ),
      new vector(
        1.25 + sin_phi,
        -0.5 - cos_phi / 2,
        -1.25 - sqrt3h * cos_phi
      ).multiplyScalar(1.5),
      new vector(
        0.75 - sin_phi,
        1 + cos_phi / 2,
        +sqrt3h * cos_phi
      ).multiplyScalar(1.5),
    ];

    const hydrogenAtoms = [];
    for (let index = 0; index < hydrogenPositions.length; index++)
      hydrogenAtoms.push(new Hydrogen(hydrogenPositions[index]));

    const oxygenPositions = [new vector(0.75, 1, 0).multiplyScalar(1.5)];
    oxygenPositions.push(new vector(1.25, -0.5, -1.25).multiplyScalar(1.5));
    oxygenPositions.push(new vector(0.25, -1.25, -1.25).multiplyScalar(1.5)); // Double bond is located here
    const oxygenAtoms = [];
    for (let index = 0; index < oxygenPositions.length; index++)
      oxygenAtoms.push(new Oxygen(oxygenPositions[index]));

    this.addBond(new Bond(carbonAtoms[1], hydrogenAtoms[3]));
    this.addBond(new Bond(carbonAtoms[1], oxygenAtoms[0]));
    this.addBond(new Bond(carbonAtoms[2], oxygenAtoms[1]));
    this.addBond(new Bond(carbonAtoms[2], oxygenAtoms[2], true));
    this.addBond(new Bond(oxygenAtoms[1], hydrogenAtoms[4]));
    this.addBond(new Bond(carbonAtoms[2], oxygenAtoms[1]));
    this.addBond(new Bond(hydrogenAtoms[5], oxygenAtoms[0]));
    this.addBond(new Bond(carbonAtoms[0], hydrogenAtoms[0]));
    this.addBond(new Bond(carbonAtoms[0], hydrogenAtoms[1]));
    this.addBond(new Bond(carbonAtoms[0], hydrogenAtoms[2]));
    this.addBond(new Bond(carbonAtoms[0], carbonAtoms[1]));
    this.addBond(new Bond(carbonAtoms[1], carbonAtoms[2]));

    for (let index = 0; index < oxygenAtoms.length; index++)
      this.addAtom(oxygenAtoms[index]);
    for (let index = 0; index < hydrogenAtoms.length; index++)
      this.addAtom(hydrogenAtoms[index]);
    for (let index = 0; index < carbonAtoms.length; index++)
      this.addAtom(carbonAtoms[index]);
  }
}

class Ammonia extends Molecule {
  constructor() {
    super();
    const r0 = 2,
      phi = (107 * Math.PI) / 180,
      zN = Math.sqrt((1 + 2 * Math.cos(phi)) / (1 - Math.cos(phi)) / 2) * r0;

    const atoms = [];
    const positions = [
      new vector(r0 / 2, 0, -zN / 4).multiplyScalar(1.5),
      new vector(-r0 / 4, (Math.sqrt(3) * r0) / 4, -zN / 4).multiplyScalar(1.5),
      new vector(-r0 / 4, (-Math.sqrt(3) * r0) / 4, -zN / 4).multiplyScalar(
        1.5
      ),
    ];
    for (let index = 0; index < positions.length; index++)
      atoms.push(new Hydrogen(positions[index]));

    const nitrogenAtom = new Nitrogen(
      new vector(0, 0, zN / 4).multiplyScalar(1.5)
    );
    for (let index = 0, n = atoms.length; index < n; index++)
      this.addBond(new Bond(atoms[index], nitrogenAtom));
    atoms.push(nitrogenAtom);

    atoms.forEach((atom) => {
      this.addAtom(atom);
    });
  }
}

const molecules = [
  new SodiumBicarbonate(),
  new Ethanol(),
  new Lactate(),
  new Methane(),
  new Water(),
  new Ammonia(),
];
molecules.forEach((molecule) => {
  molecule.hide();
});

const buttons = new Map();
buttons.set("Ethanol", 1);
buttons.set("Methane", 3);
buttons.set("Lactate", 2);
buttons.set("Baking soda", 0);
buttons.set("Water", 4);
buttons.set("Ammonia", 5);
let currentSelectedMolecule = molecules[0];
setMolecule("Baking soda");

function setMolecule(molecule) {
  molecules.forEach((molecule) => {
    molecule.hide();
  });
  currentSelectedMolecule = molecules[buttons.get(molecule)];
  currentSelectedMolecule.show();
  document.getElementById("info").innerHTML =
    "<h1>" + molecule + "</h1><p>3D Visualization</p>";
}

function onMouseMove(event) {
  currentSelectedMolecule.onMouseMove(event);
}

function setViewMode(mode) {
  currentSelectedMolecule.setViewModeTo(mode);
}

function toggleRotation() {
  isRotating = !isRotating;
}

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
  if (mouseDown) {
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
  currentSelectedMolecule.rotate(0, 0, 0);
  camera.position.set(0, 0, 8);
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

// Import export functionality
// Feel free to build on it or impove it

// export 
function exportMolecule() {
  const currentMolecule = currentSelectedMolecule;
  
  // moleculte data struct
  const exportData = {
    name: document.getElementById("info").querySelector("h1").textContent,
    atoms: [],
    bonds: []
  };
  
  // extract atom data
  currentMolecule.atoms.forEach(atom => {
    exportData.atoms.push({
      type: atom.userData.name,
      position: {
        x: atom.position.x,
        y: atom.position.y,
        z: atom.position.z
      },
      charge: atom.userData.charge || "0",
      properties: {
        fullName: atom.userData.fullName,
        atomicNumber: atom.userData.atomicNumber,
        atomicWeight: atom.userData.atomicWeight
      }
    });
  });
  
  // extract bond data
  currentMolecule.bonds.forEach(bondGroup => {
    const isDouble = bondGroup.children.length > 1;
    
    // find endpoints
    const bondMesh = bondGroup.children[0];
    const direction = new THREE.Vector3(0, 1, 0);
    direction.applyQuaternion(bondMesh.quaternion);
    
    // calculate start and end positions of endpoints
    const length = bondMesh.geometry.parameters.height;
    const start = bondMesh.position.clone().sub(direction.clone().multiplyScalar(length/2));
    const end = bondMesh.position.clone().add(direction.clone().multiplyScalar(length/2));
    
    // find the closest atoms to the start and end positions
    const startAtomIndex = findClosestAtomIndex(start, currentMolecule.atoms);
    const endAtomIndex = findClosestAtomIndex(end, currentMolecule.atoms);
    
    if (startAtomIndex !== -1 && endAtomIndex !== -1) {
      exportData.bonds.push({
        atom1Index: startAtomIndex,
        atom2Index: endAtomIndex,
        isDouble: isDouble
      });
    }
  });
  
  const jsonData = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportData.name.replace(/\s+/g, '_').toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  
  // clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// find the closest atom index to a given point
function findClosestAtomIndex(point, atoms) {
  let closestDistance = Infinity;
  let closestIndex = -1;
  
  atoms.forEach((atom, index) => {
    const distance = point.distanceTo(atom.position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  
  return closestIndex;
}

// simple import function
// this is a basic implementation, feel free to improve it
function importMolecule() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const data = JSON.parse(event.target.result);
        createMoleculeFromImport(data);
      } catch (error) {
        alert('failed to parse' + error.message);
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

// create a molecule from imported data
function createMoleculeFromImport(data) {
  if (!data.atoms || !data.bonds || !data.name) {
    alert('Invalid format');
    return;
  }
  
  class ImportedMolecule extends Molecule {
    constructor(data) {
      super();
      
      // create atoms
      const atomObjects = [];
      data.atoms.forEach(atomData => {
        let atom;
        const position = new THREE.Vector3(
          atomData.position.x, 
          atomData.position.y, 
          atomData.position.z
        );
        
        // create the appropriate atom type
        // Note: You can add more atom types as needed
        switch(atomData.type) {
          case 'C':
            atom = new Carbon(position, atomData.charge);
            break;
          case 'O':
            atom = new Oxygen(position, atomData.charge);
            break;
          case 'H':
            atom = new Hydrogen(position, atomData.charge);
            break;
          case 'N':
            atom = new Nitrogen(position, atomData.charge);
            break;
          case 'Na⁺':
            atom = new Sodium(position, atomData.charge);
            break;
          default:
            // fallback to generic atom
            atom = new Atom(
              position, 
              0xdddddd, 
              0.5, 
              false, 
              atomData.type,
              {
                fullName: atomData.properties?.fullName || atomData.type,
                charge: atomData.charge || "0",
                atomicNumber: atomData.properties?.atomicNumber || 0,
                atomicWeight: atomData.properties?.atomicWeight || "0 g/mol"
              }
            );
        }
        
        this.addAtom(atom);
        atomObjects.push(atom);
      });
      
      // createa boonds
      data.bonds.forEach(bondData => {
        if (bondData.atom1Index >= 0 && bondData.atom2Index >= 0 &&
            bondData.atom1Index < atomObjects.length && 
            bondData.atom2Index < atomObjects.length) {
          const bond = new Bond(
            atomObjects[bondData.atom1Index], 
            atomObjects[bondData.atom2Index],
            bondData.isDouble
          );
          this.addBond(bond);
        }
      });
    }
  }
  
  // create the imported molecule
  const importedMolecule = new ImportedMolecule(data);
  molecules.forEach(molecule => molecule.hide());
  
  // add to UI
  molecules.push(importedMolecule);
  const nextIndex = molecules.length - 1;
  buttons.set(data.name, nextIndex);
  addMoleculeButton(data.name);
  setMolecule(data.name);
  importedMolecule.setViewModeTo(viewMode);
}

// add a button for the import
function addMoleculeButton(name) {
  const viewControls = document.getElementById('viewControls');
  const moleculesSection = viewControls.querySelector('strong:contains("Molecules:")');
  const buttons = viewControls.querySelectorAll('button');
  const lastButton = buttons[buttons.length - 1];
  
  const newButton = document.createElement('button');
  newButton.textContent = name;
  newButton.onclick = () => setMolecule(name);
  
  // its not clean but it works
  if (buttons.length % 2 === 0) {
    const br = document.createElement('br');
    moleculesSection.parentNode.insertBefore(br, lastButton.nextSibling);
    moleculesSection.parentNode.insertBefore(newButton, br.nextSibling);
  } else {
    moleculesSection.parentNode.insertBefore(newButton, lastButton.nextSibling);
  }
}

// custom querySelector to find elements by text content
Document.prototype.querySelector = function(selector) {
  if (selector.includes(':contains')) {
    const parts = selector.split(':contains');
    const element = parts[0];
    const text = parts[1].replace(/[()'"]/g, '');
    
    const elements = document.querySelectorAll(element);
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].textContent.includes(text)) {
        return elements[i];
      }
    }
    return null;
  }
  return this.querySelectorAll(selector)[0];
};

Element.prototype.querySelector = Document.prototype.querySelector;

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  if (isRotating && !mouseDown && !rightMouseDown)
    currentSelectedMolecule.rotateY(0.005);

  renderer.render(scene, camera);
}

animate();
