window.patterns.push(function () {
  let rows = 5;
  let pattern = "";

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= i; j++) {
      pattern += "* ";
    }
    pattern += "\n";
  }

  return {
    title: "Triangle Pattern",
    output: pattern
  };
});
