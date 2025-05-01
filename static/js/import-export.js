function exportMolecule(currentSelectedMolecule) {
  if (!currentSelectedMolecule) return;

  const exportData = {
    name: currentSelectedMolecule.name,
    formula: currentSelectedMolecule.formula || "",
    atoms: currentSelectedMolecule.atoms.map((atom) => ({
      type: atom.userData.name,
      position: {
        x: atom.position.x,
        y: atom.position.y,
        z: atom.position.z,
      },
      charge: atom.userData.charge,
    })),
    bonds: [],
  };

  currentSelectedMolecule.bonds.forEach((bondGroup) => {
    const isDouble = bondGroup.children.length > 1;
    const bondMesh = bondGroup.children[0];
    const direction = new THREE.Vector3(0, 1, 0);
    direction.applyQuaternion(bondMesh.quaternion);

    const length = bondMesh.geometry.parameters.height;
    const start = bondMesh.position
      .clone()
      .sub(direction.clone().multiplyScalar(length / 2));
    const end = bondMesh.position
      .clone()
      .add(direction.clone().multiplyScalar(length / 2));

    const startAtomIndex = findClosestAtomIndex(
      start,
      currentSelectedMolecule.atoms
    );
    const endAtomIndex = findClosestAtomIndex(
      end,
      currentSelectedMolecule.atoms
    );

    if (startAtomIndex !== -1 && endAtomIndex !== -1) {
      exportData.bonds.push({
        atom1Index: startAtomIndex,
        atom2Index: endAtomIndex,
        isDouble: isDouble,
      });
    }
  });

  downloadJson(
    exportData,
    `${exportData.name.replace(/\s+/g, "_").toLowerCase()}.json`
  );
}

function downloadJson(data, filename) {
  const jsonData = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

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

function importMolecule(
  Atom,
  Bond,
  Molecule,
  molecules,
  buttons,
  scene,
  setMolecule,
  viewMode
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        createMoleculeFromImport(
          data,
          Atom,
          Bond,
          Molecule,
          molecules,
          buttons,
          scene,
          setMolecule,
          viewMode
        );
      } catch (error) {
        alert("Failed to parse file: " + error.message);
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

function createMoleculeFromImport(
  data,
  Atom,
  Bond,
  Molecule,
  molecules,
  buttons,
  scene,
  setMolecule,
  viewMode
) {
  if (!data.atoms || !data.bonds || !data.name) {
    alert("Invalid molecule format");
    return;
  }

  if (buttons.has(data.name)) {
    if (!confirmOverwrite(data.name)) return;
    removeMolecule(data.name, molecules, buttons, scene);
  }

  const importedMolecule = createImportedMolecule(
    data,
    Atom,
    Bond,
    Molecule,
    scene
  );

  hideAllMolecules(molecules);

  addMoleculeToCollection(importedMolecule, data.name, molecules, buttons);
  addMoleculeButton(data.name, setMolecule);

  setMolecule(data.name);
  importedMolecule.setViewModeTo(viewMode);
}

function confirmOverwrite(moleculeName) {
  return confirm(
    `A molecule named "${moleculeName}" already exists. Do you want to replace it?`
  );
}

function removeMolecule(name, molecules, buttons, scene) {
  const index = buttons.get(name);
  if (!molecules[index]) return;

  const oldMolecule = molecules[index];
  disposeThreeJsObjects(oldMolecule);
  scene.remove(oldMolecule.molecule);
  molecules.splice(index, 1);

  removeButton(name);
  updateButtonIndices(index, buttons);
}

function disposeThreeJsObjects(molecule) {
  molecule.atoms.forEach((atom) => {
    atom.geometry.dispose();
    atom.material.dispose();
  });

  molecule.bonds.forEach((bondGroup) => {
    bondGroup.children.forEach((bond) => {
      bond.geometry.dispose();
      bond.material.dispose();
    });
  });
}

function removeButton(name) {
  const viewControls = document.getElementById("viewControls");
  const existingButton = Array.from(
    viewControls.querySelectorAll("button")
  ).find((button) => button.textContent === name);

  if (existingButton) {
    existingButton.remove();
  }
}

function updateButtonIndices(removedIndex, buttons) {
  buttons.forEach((value, key) => {
    if (value > removedIndex) {
      buttons.set(key, value - 1);
    }
  });
}

function createImportedMolecule(data, Atom, Bond, Molecule, scene) {
  class ImportedMolecule extends Molecule {
    constructor(data) {
      super(data);
      this.name = data.name;
      this.formula = data.formula || "";

      this.molecule = new THREE.Group();
      this.atoms = [];
      this.bonds = [];
      scene.add(this.molecule);

      const atomObjects = this.createAtoms(data.atoms, Atom);
      this.createBonds(data.bonds, atomObjects, Bond);
    }

    createAtoms(atomsData, Atom) {
      const atomObjects = [];

      atomsData.forEach((atomData) => {
        const position = new THREE.Vector3(
          atomData.position.x,
          atomData.position.y,
          atomData.position.z
        );

        const atom = new Atom(position, atomData.type, atomData.charge || "0");

        if (atom.getThreeJsHandle()) {
          this.addAtom(atom);
          atomObjects.push(atom);
        } else {
          console.error(`Failed to create atom of type ${atomData.type}`);
        }
      });

      return atomObjects;
    }

    createBonds(bondsData, atomObjects, Bond) {
      bondsData.forEach((bondData) => {
        const { atom1Index, atom2Index, isDouble } = bondData;
        const atomsExist = this.validateAtomIndices(
          atom1Index,
          atom2Index,
          atomObjects.length
        );

        if (atomsExist) {
          const bond = new Bond(
            atomObjects[atom1Index],
            atomObjects[atom2Index],
            isDouble
          );
          this.addBond(bond);
        }
      });
    }

    validateAtomIndices(index1, index2, totalAtoms) {
      return (
        index1 >= 0 && index2 >= 0 && index1 < totalAtoms && index2 < totalAtoms
      );
    }
  }

  return new ImportedMolecule(data);
}

function hideAllMolecules(molecules) {
  molecules.forEach((molecule) => {
    if (molecule && typeof molecule.hide === "function") {
      molecule.hide();
    }
  });
}

function addMoleculeToCollection(molecule, name, molecules, buttons) {
  if (buttons.has(name)) {
    const index = buttons.get(name);
    molecules.splice(index, 0, molecule);
  } else {
    molecules.push(molecule);
    buttons.set(name, molecules.length - 1);
  }
}

function addMoleculeButton(name, setMolecule) {
  const viewControls = document.getElementById("viewControls");
  if (!viewControls) {
    console.error("View controls element not found");
    return;
  }

  if (buttonExists(name, viewControls)) return;

  const moleculesSection = findMoleculesSection(viewControls);
  if (!moleculesSection) {
    console.error("Molecules section not found");
    return;
  }

  const buttons = viewControls.querySelectorAll("button");
  const lastButton = buttons[buttons.length - 1];
  const newButton = createButton(name, setMolecule);

  insertButtonInUI(
    newButton,
    lastButton,
    moleculesSection,
    buttons.length % 2 === 0
  );
}

function buttonExists(name, viewControls) {
  return Array.from(viewControls.querySelectorAll("button")).some(
    (button) => button.textContent === name
  );
}

function findMoleculesSection(viewControls) {
  const strongs = viewControls.querySelectorAll("strong");
  for (let i = 0; i < strongs.length; i++) {
    if (strongs[i].textContent.includes("Molecules:")) {
      return strongs[i];
    }
  }
  return null;
}

function createButton(name, setMolecule) {
  const button = document.createElement("button");
  button.textContent = name;
  button.onclick = () => setMolecule(name);
  return button;
}

function insertButtonInUI(
  newButton,
  lastButton,
  moleculesSection,
  needsLineBreak
) {
  if (needsLineBreak) {
    const br = document.createElement("br");
    moleculesSection.parentNode.insertBefore(br, lastButton.nextSibling);
    moleculesSection.parentNode.insertBefore(newButton, br.nextSibling);
  } else {
    moleculesSection.parentNode.insertBefore(newButton, lastButton.nextSibling);
  }
}

export { exportMolecule, importMolecule };
