// Vertex shader program
var VSHADER_SOURCE =
  'attribute vec2 coordinates;\n' +
  'void main() {\n' +
  '  gl_Position = vec4(coordinates, 0.0, 1.0);\n' +
  '}\n';

// Fragment shader program
var FSHADER_SOURCE =
  'precision mediump float;\n' +
  'uniform vec4 u_FragColor;\n' +
  'void main() {\n' +
  '  gl_FragColor = u_FragColor;\n' +
  '}\n';

function main() {
  var canvas = document.getElementById('webgl');
  var gl = getWebGLContext(canvas);
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }

  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to initialize shaders.');
    return;
  }

  var a_Position = gl.getAttribLocation(gl.program, 'coordinates');
  if (a_Position < 0) {
    console.log('Failed to get the storage location of coordinates');
    return;
  }

  var u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  if (!u_FragColor) {
    console.log('Failed to get the storage location of u_FragColor');
    return;
  }

  var bacteriaList = [];
  var player_points = 0;
  var game_points = 0;
  var growthSpeed = 0.0007;
  var diskRadius = 0.8; 
  var THRESHOLD_GROWTH = 0.25;

  for (var i = 0; i < 10; i++) {
    var angle = Math.random() * Math.PI * 2;
    var spawn = { 
      x: diskRadius * Math.cos(angle), 
      y: diskRadius * Math.sin(angle) 
    };
    bacteriaList.push(createBacteria([Math.random(), Math.random(), Math.random(), 1.0], diskRadius, 1.0, [spawn]));
  }

  canvas.addEventListener('click', function(event) {
    var rect = canvas.getBoundingClientRect();
    var mouseX = event.clientX - rect.left;
    var mouseY = event.clientY - rect.top;
    var clipX = (mouseX / canvas.width) * 2 - 1;
    var clipY = 1 - (mouseY / canvas.height) * 2;

    for (var i = 0; i < bacteriaList.length; i++) {
      var bac = bacteriaList[i];
      if (bac.alive && isInsideBacteria(clipX, clipY, bac)) {
        player_points += 1;
        bac.alive = false;
        console.log('Bacteria clicked. Player points:', player_points);
        break;
      }
    }
  });

  tick();

  function tick() {
    updateBacteria(bacteriaList, growthSpeed);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawCircle(gl, 0, 0, diskRadius, [1.0, 1.0, 1.0, 1.0]);
    for (var i = 0; i < bacteriaList.length; i++) {
      var bac = bacteriaList[i];
      if (bac.alive) {
        drawCircle(gl, bac.x, bac.y, bac.radius, bac.color);
      }
    }
    document.getElementById('game_points').innerHTML = 'Game gains: ' + game_points;
    document.getElementById('player_points').innerHTML = 'Player gains: ' + player_points;

    if (player_points >= 10 || game_points >= 10) {
      endGame();
      return;
    }
    requestAnimationFrame(tick);
  }

  function updateBacteria(list, speed) {
    list.forEach(function(bac) {
      if (bac.alive) {
        bac.radius += speed;
        if (!bac.thresholdReached && (bac.radius - bac.initialRadius) >= THRESHOLD_GROWTH) {
          bac.thresholdReached = true;
          game_points += 5;
          console.log('Bacteria grew. Game points:', game_points);
        }
      }
    });
  }

  function createBacteria(color, diskRadius, aspect, spawnPoints) {
    if (spawnPoints.length === 0) return null;
    var spawn = spawnPoints[0];
    var x = spawn.x;
    var y = spawn.y;
    var initialRadius = 0.02;
    return { 
      x: x, 
      y: y, 
      radius: initialRadius, 
      color: color, 
      alive: true, 
      initialRadius: initialRadius, 
      thresholdReached: false, 
      createdTime: Date.now() 
    };
  }

  function isInsideBacteria(x, y, bac) {
    var dx = x - bac.x;
    var dy = y - bac.y;
    return dx * dx + dy * dy <= bac.radius * bac.radius;
  }

  function drawCircle(gl, centerX, centerY, radius, color) {
    var numVertices = 100;
    var vertices = [];
    vertices.push(centerX, centerY);
    var aspect = gl.canvas.width / gl.canvas.height;
    for (var i = 0; i <= numVertices; i++) {
      var angle = (i / numVertices) * Math.PI * 2;
      vertices.push(centerX + (radius * Math.cos(angle)) / aspect);
      vertices.push(centerY + radius * Math.sin(angle));
    }
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);
    gl.uniform4f(u_FragColor, color[0], color[1], color[2], color[3]);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length / 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  function endGame() {
    var result = player_points >= 10 ? 'You win!' : 'You lose!';
    document.getElementById('win_lose').innerHTML = result;
  }
}

