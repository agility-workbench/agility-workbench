function createVirtualTable(container, options) {
  return new VirtualTableEnginePatched(container, options);
}

document.onload = () => {
  const container = document.getElementById("table-container");
  const table = createVirtualTable(container, {
    columns: [
      { key: "id", label: "ID", minWidth: 50 },
      { key: "name", label: "Name", minWidth: 150 },
      { key: "age", label: "Age", width: 50 },
      { key: "address", label: "Address", minWidth: 200 },
      { key: "email", label: "Email", minWidth: 200 },
      { key: "phone", label: "Phone", minWidth: 150 },
    ],
    rowHeight: 30,
    height: 300,
    overscan: 5,
  });

  // Sample data
  const data = [];
  for (let i = 1; i <= 100000; i++) {
    data.push({
        id: i,
        // Randomly sized name
        name: `Name ${'A'.repeat(Math.floor(Math.random() * 20))}`,
        age: Math.floor(Math.random() * 100),
        address: `1234 Elm Street, Apt ${i}, Springfield, State, Country`,
        email: `name${i}@example.com`,
        phone: `+1-555-000${i.toString().padStart(4, '0')}`,
     });
  }
  table.setData(data);

};

document.onreadystatechange = () => {
  if (document.readyState === "complete") {
    document.onload();
  }
};
