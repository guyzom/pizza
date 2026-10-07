/* Optional HDR bloom for Three.js r160. Capability-gated and explicitly owned. */
(function (global) {
  "use strict";
  var THREE = global.THREE;
  if (!THREE) return;
  var QUAD_VS = "varying vec2 vUv;void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  var BRIGHT_FS =
    "uniform sampler2D tDiffuse; uniform float threshold; uniform float knee; varying vec2 vUv;" +
    "void main(){vec3 c = texture2D(tDiffuse, vUv).rgb;" +
    "float l = dot(c, vec3(0.2126, 0.7152, 0.0722));" +
    "float s = smoothstep(threshold, threshold + knee, l);gl_FragColor = vec4(c * s, 1.0);}";
  var BLUR_FS =
    "uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;" +
    "void main(){vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270270;" +
    "sum += texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb * 0.3162162162;" +
    "sum += texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb * 0.3162162162;" +
    "sum += texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb * 0.0702702703;" +
    "sum += texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb * 0.0702702703;gl_FragColor = vec4(sum, 1.0);}";
  var COMPOSITE_FS =
    "uniform sampler2D tScene; uniform sampler2D tBloom;" +
    "uniform float bloomStrength; varying vec2 vUv;" +
    "void main(){vec3 hdr = texture2D(tScene, vUv).rgb;hdr += texture2D(tBloom, vUv).rgb * bloomStrength;" +
    "gl_FragColor = vec4(hdr, 1.0);\n" +
    "#include <tonemapping_fragment>\n" +
    "#include <colorspace_fragment>\n" +
    "}";
  function makeMat(fs, uniforms, toneMapped) {
    return new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: !!toneMapped });
  }
  function create(renderer, opts) {
    opts = opts || {};
    // WebGL2 alone does not guarantee renderable floating-point color attachments.
    var caps = renderer.capabilities;
    if (!caps || !caps.isWebGL2 || !renderer.extensions || !renderer.extensions.has("EXT_color_buffer_float")) return null;
    var owned = [];
    function own(resource) { owned.push(resource); return resource; }
    try {
      var HALF = THREE.HalfFloatType;
      var sceneRT = own(new THREE.WebGLRenderTarget(2, 2, { type: HALF, samples: 0, depthBuffer: true, stencilBuffer: false }));
      sceneRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
      var brightRT = own(new THREE.WebGLRenderTarget(2, 2, { type: HALF, depthBuffer: false }));
      var blurA = own(new THREE.WebGLRenderTarget(2, 2, { type: HALF, depthBuffer: false }));
      var blurB = own(new THREE.WebGLRenderTarget(2, 2, { type: HALF, depthBuffer: false }));
      [brightRT, blurA, blurB].forEach(function (rt) {
        rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
        rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
      });
      // Only HDR highlights enter the glow pass; ordinary surface colors stay crisp.
      var brightMat = own(makeMat(BRIGHT_FS, { tDiffuse: { value: null }, threshold: { value: opts.threshold != null ? opts.threshold : 1.8 }, knee: { value: 0.4 } }));
      var blurMat = own(makeMat(BLUR_FS, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }));
      var compMat = own(makeMat(COMPOSITE_FS, {
        tScene: { value: sceneRT.texture }, tBloom: { value: blurB.texture },
        bloomStrength: { value: opts.bloomStrength != null ? opts.bloomStrength : 0.16 }
      }, true));
      var quadScene = new THREE.Scene();
      var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      var quad = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), brightMat);
      quadScene.add(quad);
      // Three.js keeps non-XR render targets linear, then applies the same renderer
      // tone mapping and output transform to the final quad as to direct rendering.
      var W = 1, H = 1, halfW = 1, halfH = 1;
      function setSize(w, h) {
        if (disposed) throw new Error("Post-processing has been disposed");
        var pr = renderer.getPixelRatio();
        W = Math.max(1, Math.floor(w * pr)); H = Math.max(1, Math.floor(h * pr));
        halfW = Math.max(1, Math.floor(W / 2)); halfH = Math.max(1, Math.floor(H / 2));
        sceneRT.setSize(W, H);
        brightRT.setSize(halfW, halfH); blurA.setSize(halfW, halfH); blurB.setSize(halfW, halfH);
      }
      function blit(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
      function render(scene, camera) {
        if (disposed) throw new Error("Post-processing has been disposed");
        var previousTarget = renderer.getRenderTarget();
        try {
          renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
          brightMat.uniforms.tDiffuse.value = sceneRT.texture; blit(brightMat, brightRT);
          var tx = 1 / halfW, ty = 1 / halfH;
          blurMat.uniforms.tDiffuse.value = brightRT.texture; blurMat.uniforms.dir.value.set(tx, 0); blit(blurMat, blurA);
          blurMat.uniforms.tDiffuse.value = blurA.texture; blurMat.uniforms.dir.value.set(0, ty); blit(blurMat, blurB);
          blurMat.uniforms.tDiffuse.value = blurB.texture; blurMat.uniforms.dir.value.set(tx * 2, 0); blit(blurMat, blurA);
          blurMat.uniforms.tDiffuse.value = blurA.texture; blurMat.uniforms.dir.value.set(0, ty * 2); blit(blurMat, blurB);
          compMat.uniforms.tScene.value = sceneRT.texture; compMat.uniforms.tBloom.value = blurB.texture;
          quad.material = compMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
        } finally {
          renderer.setRenderTarget(previousTarget);
        }
      }
      var disposed = false;
      function dispose() {
        if (disposed) return;
        disposed = true;
        if ([sceneRT, brightRT, blurA, blurB].indexOf(renderer.getRenderTarget()) !== -1) renderer.setRenderTarget(null);
        owned.forEach(function (resource) { resource.dispose(); });
      }
      return { render: render, setSize: setSize, dispose: dispose, uniforms: compMat.uniforms, isPostFX: true };
    } catch (error) {
      owned.forEach(function (resource) { resource.dispose(); });
      throw error;
    }
  }
  global.GamePostFX = { create: create };
})(window);
