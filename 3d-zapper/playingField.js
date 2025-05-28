// Vertex shader program
var VSHADER_SOURCE =
  'attribute vec4 a_Position;\n' +
  'attribute vec4 a_Color;\n' +
  'attribute vec3 a_Normal;\n' +  
  'uniform mat4 Pmatrix;\n' +
  'uniform mat4 Vmatrix;\n' +
  'uniform mat4 Mmatrix;\n' +
  'varying vec4 v_Color;\n' +
  'varying vec3 v_Normal;\n' +
  'void main() {\n' +
  '  gl_Position = Pmatrix * Vmatrix * Mmatrix * a_Position;\n' +
  '  v_Color = a_Color;\n' +
  '  vec4 transformedNormal = Mmatrix * vec4(a_Normal, 0.0);\n' +
  '  v_Normal = normalize(transformedNormal.xyz);\n' +
  '}\n';

// Fragment shader program
var FSHADER_SOURCE =
  '#ifdef GL_ES\n' +
  'precision mediump float;\n' +
  '#endif\n' +
  'varying vec4 v_Color;\n' +
  'varying vec3 v_Normal;\n' +
  'uniform int u_BacteriaCount;\n' +
  'uniform vec3 u_TransformedBacteriaCenters[10];\n' +
  'uniform float u_BacteriaRadii[10];\n' +
  'uniform vec4 u_BacteriaColors[10];\n' +
  'void main() {\n' +
  '  vec4 baseColor = v_Color;\n' +
  '  vec3 N = normalize(v_Normal);\n' +
  '  for (int i = 0; i < 10; i++) {\n' +
  '    if (i >= u_BacteriaCount) break;\n' +
  '    float angle = acos(dot(N, normalize(u_TransformedBacteriaCenters[i])));\n' +
  '    if (angle < u_BacteriaRadii[i]) {\n' +
  '      baseColor = u_BacteriaColors[i];\n' +
  '    }\n' +
  '  }\n' +
  '  gl_FragColor = baseColor;\n' +
  '}\n';

// Global variables for rotation (mouse controlled)
var AMORTIZATION = 0.95;
var drag = false;
var old_x, old_y;
var dX = 0, dY = 0;
var THETA = 0, PHI = 0;

// Global matrices 
var u_ModelMatrix = null;
var u_ViewMatrix = null;
var u_ProjectionMatrix = null;

// Global uniform locations for bacteria
var u_BacteriaCount, u_TransformedBacteriaCenters, u_BacteriaRadii, u_BacteriaColors;

const MAX_BACTERIA = 10;
var bacteriaList = [];

// Create a bacterium object with a random starting point on the sphere
function createRandomBacteria() {
  // Random spherical coordinates:
  var phi = 2 * Math.PI * Math.random();    // [0, 2π)
  var theta = Math.acos(2 * Math.random() - 1); // [0, π]
  // Convert to Cartesian (unit vector on sphere)
  var x = Math.sin(theta) * Math.cos(phi);
  var y = Math.sin(theta) * Math.sin(phi);
  var z = Math.cos(theta);
  // Random color for the bacterium
  var r = Math.random();
  var g = Math.random();
  var b = Math.random();
  return {
    center: [x, y, z],      
    radius: 0.0,           
    color: [r, g, b, 1.0],  
    growthRate: 0.0005,    
    scored: false          
  };
}

var numBacteria = Math.floor(Math.random() * MAX_BACTERIA) + 2;
for (var i = 0; i < numBacteria; i++) {
  bacteriaList.push(createRandomBacteria());
}

function main() {
  var player_points = 0;
  var bacteriaReached = 0;
  var targetScore = numBacteria * 15;
  var gameOver = false;
  var animFrameId = null; 
  
  // Retrieve <canvas> element
  var canvas = document.getElementById('webgl');

  // Get the WebGL context 
  var gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }

  // Initialize shaders
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to intialize shaders.');
    return;
  }

  // Set clear color and enable depth test
  gl.clearColor(0, 0, 0, 1);
  gl.enable(gl.DEPTH_TEST);

  // Get the storage locations of uniform matrices
  u_ModelMatrix = gl.getUniformLocation(gl.program, "Mmatrix");
  u_ViewMatrix = gl.getUniformLocation(gl.program, "Vmatrix");
  u_ProjectionMatrix = gl.getUniformLocation(gl.program, "Pmatrix");

  // Get uniform locations for bacteria
  u_BacteriaCount = gl.getUniformLocation(gl.program, "u_BacteriaCount");
  u_TransformedBacteriaCenters = gl.getUniformLocation(gl.program, "u_TransformedBacteriaCenters");
  u_BacteriaRadii = gl.getUniformLocation(gl.program, "u_BacteriaRadii");
  u_BacteriaColors = gl.getUniformLocation(gl.program, "u_BacteriaColors");

  if (!u_ModelMatrix || !u_ViewMatrix || !u_ProjectionMatrix ||
      !u_BacteriaCount || !u_TransformedBacteriaCenters ||
      !u_BacteriaRadii || !u_BacteriaColors) {
    console.log('Failed to get the storage location for one or more uniforms');
    return;
  }

  // Initialize vertex buffers (returns the count of indices)
  var n = initVertexBuffers(gl);
  if (n < 0) {
    console.log('Failed to set the vertex information');
    return;
  }

  // Mouse event handlers for rotation
  canvas.addEventListener("mousedown", function(e) {
    drag = true;
    old_x = e.pageX;
    old_y = e.pageY;
    e.preventDefault();
    return false;
  }, false);

  canvas.addEventListener("mouseup", function(e) {
    drag = false;
  }, false);

  canvas.addEventListener("mouseout", function(e) {
    drag = false;
  }, false);

  canvas.addEventListener("mousemove", function(e) {
    if (!drag) return false;
    dX = (e.pageX - old_x) * 2 * Math.PI / canvas.width;
    dY = (e.pageY - old_y) * 2 * Math.PI / canvas.height;
    THETA += dX;
    PHI += dY;
    old_x = e.pageX;
    old_y = e.pageY;
    e.preventDefault();
  }, false);

  // Click event to remove bacteria and update score
  canvas.addEventListener("click", function(e) {
    if (gameOver) return;  // Do nothing if the game is over
    gl.finish();
  
    // Convert to canvas coordinates
    var rect = canvas.getBoundingClientRect();
    console.log("Canvas rect:", rect, "canvas.width:", canvas.width, "canvas.height:", canvas.height);
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var flipY = canvas.height - y;
    console.log("Click coords:", { x: x, y: y, flipY: flipY });
  
    var pixel = new Uint8Array(4);
    gl.readPixels(x, flipY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    console.log("Clicked pixel:", pixel);
  
    // If a bacterium is removed, update the player's score
    if (checkClickedBacterium(pixel)) {
      player_points += 15;
      document.getElementById('player_points').textContent = 'Player gains: ' + player_points;
      if (player_points >= targetScore) {
        document.getElementById('win_lose').innerHTML = 'You win!';
        gameOver = true;
        cancelAnimationFrame(animFrameId);
      }
    }
  });

  // Set up view and projection matrices
  var viewMatrix = new Matrix4();  // View matrix
  var projMatrix = new Matrix4();  // Projection matrix
  projMatrix.setPerspective(80, canvas.width / canvas.height, 1, 100);
  viewMatrix.elements[14] -= 6;    // Move camera away from the object

  function animate() {
    if (gameOver) {
      cancelAnimationFrame(animFrameId);
      return;
    }
    
    // Update rotation
    if (!drag) {
      dX *= AMORTIZATION;
      dY *= AMORTIZATION;
      THETA += dX;
      PHI += dY;
    }

    // Update bacteria growth
    for (let i = 0; i < bacteriaList.length; i++) {
      bacteriaList[i].radius += bacteriaList[i].growthRate;
    }
    // Check if any bacterium reaches the threshold 
    var thresholdAngle = Math.PI / 6;  
    for (let i = 0; i < bacteriaList.length; i++) {
      if (!bacteriaList[i].scored && bacteriaList[i].radius >= thresholdAngle) {
        bacteriaReached++;
        bacteriaList[i].scored = true;
        document.getElementById('bacteriaReached').textContent = 'Bacteria reached: ' + bacteriaReached;
        if (bacteriaReached >= 2) {
          document.getElementById('win_lose').innerHTML = 'You lose!';
          gameOver = true;
          cancelAnimationFrame(animFrameId);
          return;
        }
      }
    }

    // Build flat arrays for bacteria uniform data
    let radii = [];
    let colors = [];
    for (let i = 0; i < bacteriaList.length; i++) {
      radii.push(bacteriaList[i].radius);
      colors.push(
        bacteriaList[i].color[0],
        bacteriaList[i].color[1],
        bacteriaList[i].color[2],
        bacteriaList[i].color[3]
      );
    }
    gl.uniform1i(u_BacteriaCount, bacteriaList.length);
    gl.uniform1fv(u_BacteriaRadii, new Float32Array(radii));
    gl.uniform4fv(u_BacteriaColors, new Float32Array(colors));

    // Clear color and depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Build the model matrix for the sphere (rotation based on mouse)
    var modelMatrix = new Matrix4();
    modelMatrix.setIdentity();
    rotateY(modelMatrix.elements, THETA);
    rotateX(modelMatrix.elements, PHI);

    // Pass matrices to the shader
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_ViewMatrix, false, viewMatrix.elements);
    gl.uniformMatrix4fv(u_ProjectionMatrix, false, projMatrix.elements);

    // Compute transformed bacteria centers using the modelMatrix.
    let transformedCenters = [];
    for (let i = 0; i < bacteriaList.length; i++) {
      let center = bacteriaList[i].center;
      let m = modelMatrix.elements;
      let tx = m[0] * center[0] + m[4] * center[1] + m[8]  * center[2];
      let ty = m[1] * center[0] + m[5] * center[1] + m[9]  * center[2];
      let tz = m[2] * center[0] + m[6] * center[1] + m[10] * center[2];
      transformedCenters.push(tx, ty, tz);
    }
    gl.uniform3fv(u_TransformedBacteriaCenters, new Float32Array(transformedCenters));

    // Draw the sphere (indices count = n)
    gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);

    if (!gameOver) {
      animFrameId = requestAnimationFrame(animate);
    }
  }
  animate();
}

// Removes any bacterium whose color matches the clicked pixel (with tolerance)
function checkClickedBacterium(pixel) {
  const tolerance = 10; // acceptable color difference
  for (let i = 0; i < bacteriaList.length; i++) {
    let bc = bacteriaList[i].color;  // [r, g, b, a] in [0..1]
    let R = Math.round(bc[0] * 255);
    let G = Math.round(bc[1] * 255);
    let B = Math.round(bc[2] * 255);
    console.log(`Bacterium ${i} color: [${R}, ${G}, ${B}]`);
    
    if (Math.abs(pixel[0] - R) < tolerance &&
        Math.abs(pixel[1] - G) < tolerance &&
        Math.abs(pixel[2] - B) < tolerance) {
      console.log("Bacterium removed!");
      bacteriaList.splice(i, 1);
      return true;
    }
  }
  return false;
}

// Initialize vertex buffers (creates sphere geometry with positions, colors, normals, and indices)
function initVertexBuffers(gl) {
  var SPHERE_DIV = 180;
  var radius = 3;
  var i, ai, si, ci;
  var j, aj, sj, cj;
  var p1, p2;

  var positions = [];
  var indices = [];
  var colors = [];
  var normals = [];

  // Generate coordinates, normals, and colors
  for (j = 0; j <= SPHERE_DIV; j++) {
    aj = j * Math.PI / SPHERE_DIV;
    sj = Math.sin(aj);
    cj = Math.cos(aj);
    for (i = 0; i <= SPHERE_DIV; i++) {
      ai = i * 2 * Math.PI / SPHERE_DIV;
      si = Math.sin(ai);
      ci = Math.cos(ai);

      var x = radius * si * sj;  // X coordinate
      var y = radius * cj;       // Y coordinate
      var z = radius * ci * sj;  // Z coordinate
      positions.push(x, y, z);

      normals.push(si * sj, cj, ci * sj);

      // Set color: white dots every 10 steps, gray otherwise
      if (j % 10 === 0 && i % 10 === 0) {
        colors.push(1.0, 1.0, 1.0);
      } else {
        colors.push(0.5, 0.5, 0.5);
      }
    }
  }

  // Generate indices for the sphere
  for (j = 0; j < SPHERE_DIV; j++) {
    for (i = 0; i < SPHERE_DIV; i++) {
      p1 = j * (SPHERE_DIV + 1) + i;
      p2 = p1 + (SPHERE_DIV + 1);
      indices.push(p1, p2, p1 + 1);
      indices.push(p1 + 1, p2, p2 + 1);
    }
  }

  // Write the vertex coordinates, colors, and normals into buffers
  if (!initArrayBuffer(gl, 'a_Position', new Float32Array(positions), gl.FLOAT, 3)) return -1;
  if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), gl.FLOAT, 3)) return -1;
  if (!initArrayBuffer(gl, 'a_Normal', new Float32Array(normals), gl.FLOAT, 3)) return -1;

  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  var indexBuffer = gl.createBuffer();
  if (!indexBuffer) {
    console.log('Failed to create the buffer object');
    return -1;
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return indices.length;
}

// Initialize an attribute buffer
function initArrayBuffer(gl, attribute, data, type, num) {
  var buffer = gl.createBuffer();
  if (!buffer) {
    console.log('Failed to create the buffer object for ' + attribute);
    return false;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  var a_attribute = gl.getAttribLocation(gl.program, attribute);
  if (a_attribute < 0) {
    console.log('Failed to get the storage location of ' + attribute);
    return false;
  }
  gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
  gl.enableVertexAttribArray(a_attribute);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return true;
}

// Simple rotation helpers
function rotateX(m, angle) {
  var c = Math.cos(angle);
  var s = Math.sin(angle);
  var m1 = m[1], m5 = m[5], m9 = m[9];
  m[1] = m[1] * c - m[2] * s;
  m[5] = m[5] * c - m[6] * s;
  m[9] = m[9] * c - m[10] * s;
  m[2] = m[2] * c + m1 * s;
  m[6] = m[6] * c + m5 * s;
  m[10] = m[10] * c + m9 * s;
}

function rotateY(m, angle) {
  var c = Math.cos(angle);
  var s = Math.sin(angle);
  var m0 = m[0], m4 = m[4], m8 = m[8];
  m[0] = c * m[0] + s * m[2];
  m[4] = c * m[4] + s * m[6];
  m[8] = c * m[8] + s * m[10];
  m[2] = c * m[2] - s * m0;
  m[6] = c * m[6] - s * m4;
  m[10] = c * m[10] - s * m8;
}

main();