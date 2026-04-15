function loadPattern(n) {
  var script = document.createElement("script");
  script.src = "./scripts/patterns/pattern" + n + ".js";

  script.onload = function () {
    loadPattern(n + 1);
  };

  script.onerror = function () {
    render();
  };

  document.body.appendChild(script);
}

function render() {
  var container = document.getElementById("patterns");

  window.patterns.forEach(function (patternFn) {
    var result = patternFn();
    var card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      "<h2>⭐ " + result.title + "</h2><pre>" + result.output + "</pre>";
    container.appendChild(card);
  });
}

loadPattern(1);
