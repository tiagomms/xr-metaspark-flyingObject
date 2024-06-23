/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 */

import TimeModule from 'Time';

//==============================================================================
// Welcome to scripting in Meta Spark Studio! Helpful links:
//
// Scripting Basics - https://fb.me/spark-scripting-basics
// Reactive Programming - https://fb.me/spark-reactive-programming
// Scripting Object Reference - https://fb.me/spark-scripting-reference
// Changelogs - https://fb.me/spark-changelog
//
// Meta Spark Studio extension for VS Code - https://fb.me/spark-vscode-plugin
//
// For projects created with v87 onwards, JavaScript is always executed in strict mode.
//==============================================================================

// Load in the required modules, including the Cannon.js script package
const Scene = require('Scene');
const Time = require('Time')
const CANNON = require('cannon');
const Patches = require("Patches");
const Reactive = require('Reactive');

// Use export keyword to make a symbol available in scripting debug console
export const Diagnostics = require('Diagnostics');

// To use variables and functions across files, use export/import keyword
// export const animationDuration = 10;

// Use import keyword to import a symbol from another file
// import { animationDuration } from './script.js'

const FLYING_OBJECT_NAME = "Malik-rifle-root"
const FLYING_OBJECT_CHILD_NAME = "Malik"
const GROUND_OBJECT_ROOT_NAME = "CerealBox-Parent"
const OUTPUT_BLOCK = "MoveGift"
const FLYINB_OBJECT_MASS = 2.0
const INITIAL_FLYING_BOOST = new CANNON.Vec3(20, 300, 10) // transformValue
//const INITIAL_FLYING_BOOST = new CANNON.Vec3(15, 100, 40) // worldTransformValue

class FlyingObject {
  constructor()
  {
    Promise.all([
      Patches.outputs.getPulse("openBox"),
      Patches.outputs.getPulse("resetBox"),

      Scene.root.findFirst( FLYING_OBJECT_NAME ),
      Scene.root.findFirst( GROUND_OBJECT_ROOT_NAME ),
      Scene.root.findFirst( OUTPUT_BLOCK ),
      Scene.root.findFirst( FLYING_OBJECT_CHILD_NAME ),

    ])
    .then(e => {
        //Diagnostics.log("Constructor then");
        this.openBoxPulse = e[0];
        this.resetBoxPulse = e[1];
        this.currentObj = e[2];
        
        this.ground = e[3];

        this.outputBlock = e[4];
        this.currentChildObj = e[5];

        this.setup();
        /*
        Diagnostics.log("outputBlock outputs: " + this.outputBlock.outputs)

        for(let prop in this.outputBlock.inputs){
            Diagnostics.log(prop + ": " + this.outputBlock.inputs[prop]);
        }
        */
        //Diagnostics.log("Constructor finished");
      }
    )
  }

  printVec3(vec)
  {
    return vec !== undefined ? `x: ${vec.x}, y: ${vec.y}, z: ${vec.z}` : undefined;
  }

  // Dumb methods due to javascript issues with casting. - Had to create a way to add vectors to one another, regardless being CANNON or Meta Spark.
  convertReactiveToCannonVec3(reactiveVec3)
  {
    return new CANNON.Vec3(reactiveVec3.x, reactiveVec3.y, reactiveVec3.z);
  }

  // Note: Reactive.Vec3 (used by spark) != CANNON.Vec3 => modifications were always required 
  createCannonVec3FromAdding2Vectors(vecA, vecB)
  {
    var cannonVec3Result = new CANNON.Vec3();
    cannonVec3Result.x = vecA.x + vecB.x;
    cannonVec3Result.y = vecA.y + vecB.y;
    cannonVec3Result.z = vecA.z + vecB.z;
    
    return cannonVec3Result;
  }


  async setup()
  {
    this.initCannon();

    // this will always be my local start location
    this.objectStartLocation = new Reactive.Vec3(
      this.currentObj.transformValue.position.x,
      this.currentObj.transformValue.position.y,
      this.currentObj.transformValue.position.z - 0.05
    );

    this.childObjectStartPosition = this.currentChildObj.transformValue.position;
    this.childObjectStartRotation = this.currentChildObj.transformValue.rotation;
    this.childObjectStartScale = this.currentChildObj.transformValue.scale;

    await this.setCannonObjectCollider();

    this.setCannonWorldPlane();

    // open and close box pulse 
    this.openBoxPulse.subscribe( () => {
      this.triggerFlyingObject();
    });

    this.resetBoxPulse.subscribe( () => {
      this.resetFlyingObject();
    });
  }


  // setup Cannon, I reduced the gravity to make a nicer floating effect
  initCannon()
  {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.81 / 5, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 15;
    this.world.broadphase.useBoundingBoxes = true;
  }

  /// here I am creating the object collider around the flying object
  async setCannonObjectCollider()
  {
    // Note: for some reason boundingBoxValue of a cube with changed scale always returned 0.025 or something like that for all values
    // I had to drop this, and I couldn't generate a surrounding box collider around the player as I intended

    /*
    // just objects with the size of the collider that I pursue for my object
    const [colliderObjectArray, colliderMeshArray] = await Promise.all([
      Scene.root.findByTag("ColliderObject"),
      Scene.root.findByTag("ColliderMesh")
    ]);

    const [colliderObject, colliderMesh] = [colliderObjectArray[0], colliderMeshArray[0]]


    const boundingBoxValue = colliderMesh.boundingBoxValue;
    const meshScale = colliderMesh.transformValue.scale;

    var surroundingBoxShape = new CANNON.Vec3();
    surroundingBoxShape.x = boundingBoxValue.max.x * meshScale.x;
    surroundingBoxShape.y = boundingBoxValue.max.y * meshScale.y;
    surroundingBoxShape.z = boundingBoxValue.max.z * meshScale.z;

    ////Diagnostics.log("Flying Object: " + this.currentObj.name + "; ColliderObject - " + colliderObject.name + "; ColliderMesh - " + colliderMesh.name);
    ////Diagnostics.log("Scale - Object:" + this.printVec3(this.currentObj.transformValue.scale) + "; ColliderObject - " + this.printVec3(colliderObject.transformValue.scale) + "; ColliderMesh - " + this.printVec3(colliderMesh.transformValue.scale));
    ////Diagnostics.log("Mesh Bounding Box - min: " + this.printVec3(boundingBoxValue.min) + ", max: " + this.printVec3(boundingBoxValue.max));
    
    const shape = new CANNON.Box(surroundingBoxShape);
    ////Diagnostics.log("SurroundingBoxShapeSize: " + this.printVec3(surroundingBoxShape))
    */

    /// FLYING OBJECT SETUP
    // (1) isGiftReady - to be manipulated in the game; only true when it collides with the ground
    Patches.inputs.setBoolean('isGiftReady', false);

      // Define a set of properties for the flying object
      // Note: Must use CANNON.Vec3 (not alternatives) otherwise all crashes
      
      const flyingObjectProps = {
          mass: FLYINB_OBJECT_MASS,
      }


      // Note: for some reason creating a Body with a shape did not work well for the CANNON.Plane. 
      //For this reason I just add the shape after creating the body

        // Create a new body for the object with the previously defined set of properties
      this.CANNONflyingBody = new CANNON.Body(flyingObjectProps);
      this.CANNONflyingBody.addShape(new CANNON.Box(new CANNON.Vec3(0.22, 0.22, 0.22)));
      //this.CANNONflyingBody.addShape(shape);
      //this.CANNONflyingBody.addShape(new CANNON.Box(new CANNON.Vec3(meshScale.x / 2, meshScale.y / 2, meshScale.z / 2)));

      // Add the flying body to the cannon world
      this.world.addBody(this.CANNONflyingBody);



      //Diagnostics.log("Created flyingObjectCollider");

  }

  setCannonWorldPlane()
  {
    /// GROUND

      // Define a set of properties for the ground
      const groundProps = {
          mass: 0,
          //position: this.ground.position,
          //shape: new CANNON.Plane(),
      }
  
      // Create a new body for the ground with the previously defined set of properties
      this.CANNONgroundBody = new CANNON.Body(groundProps);
      // bug with creating body with plane shape - see note on cannon object collider - had to set up like this to work 
      this.CANNONgroundBody.addShape(new CANNON.Plane());
  
      // Rotate the ground so that it is flat and faces upwards
      const angle = -Math.PI / 2;
      const xAxis = new CANNON.Vec3(1, 0, 0);
      this.CANNONgroundBody.quaternion.setFromAxisAngle(xAxis, angle);
  
      // Add the ground body to the cannon world
      this.world.addBody(this.CANNONgroundBody);
  
      //Diagnostics.log("Created ground floor");
  }

  resetPhysics()
  {
    if (this.startPhysicsEvent != null)
    {
      TimeModule.clearInterval(this.startPhysicsEvent);
      this.startPhysicsEvent = null;
    }
  }

  resetChildPatchRoot()
  {
    this.currentChildObj.transformValue.position = this.childObjectStartPosition;
    this.currentChildObj.transformValue.rotation = this.childObjectStartRotation;
    this.currentChildObj.transformValue.scale = this.childObjectStartScale;
  }
  

  async resetFlyingObject()
  {
    // clear physics running
    this.resetPhysics();
    
    this.CANNONflyingBody.position = this.createCannonVec3FromAdding2Vectors(this.ground.worldTransformValue.position, this.objectStartLocation);
    this.currentObj.transformValue.position = this.objectStartLocation

    Patches.inputs.setBoolean('isGiftReady', false);

    //this.resetChildPatchRoot();
  }

  triggerFlyingObject()
  {
    this.startPhysics();
  }

  async startPhysics()
  {
    // Define parameters for use when configuring the time step for cannon
    // The time step advances the physics simulation forward in time
    const fixedTimeStep = 1.0 / 60.0;
    const maxSubSteps = 3;
    const timeInterval = 30;
    let lastTime;
    var that = this;

    //this.resetChildPatchRoot();

    //Diagnostics.log("triggerFlyingObject start")
    // (1) set world plane startPosition
    // Note: this + 0.2 is due to: the cannon world and the spark transform inside the cereal box parent are different and non-related
    // This means, I would have to make transformations between coordinate systems in order to have this 100% working
    // If tried implementing this using worldTransformValue. But, the CANNON world follows the camera, and does not stay with the cereal box parent
    this.CANNONgroundBody.position = new CANNON.Vec3(
      this.ground.transformValue.position.x,
      this.ground.transformValue.position.y + 0.2,
          //0,
          this.ground.transformValue.position.z
    );
    
    // (2) set flyingBody startPosition

    this.CANNONflyingBody.position = this.createCannonVec3FromAdding2Vectors(this.ground.transformValue.position, this.objectStartLocation);
    
    //Diagnostics.log("reset position flying body: " + this.printVec3(this.CANNONflyingBody.position))
    //Diagnostics.log("reset position ground body: " + this.printVec3(this.CANNONgroundBody.position))
    //this.CANNONflyingBody.position = this.currentObj.position;


    // (3) set flyingBody initial Velocity or Impulse
    //this.CANNONflyingBody.velocity = INITIAL_FLYING_BOOST;
    const initialBoost = new CANNON.Vec3(
      INITIAL_FLYING_BOOST.x * fixedTimeStep,
      INITIAL_FLYING_BOOST.y * fixedTimeStep,
      INITIAL_FLYING_BOOST.z * fixedTimeStep,
    );
    this.CANNONflyingBody.applyLocalImpulse(initialBoost, new CANNON.Vec3(0, 0, 0));

    //Diagnostics.log("flying and ground body position set")
    ////Diagnostics.log("flyingBody position: " + this.printVec3(this.CANNONflyingBody.position));
    ////Diagnostics.log("CANNONgroundBody position: " + this.printVec3(this.CANNONgroundBody.position));
    // (3) start Physics

    // Create a time interval loop for cannon
    // that - to access this variables
    this.startPhysicsEvent = Time.setInterval(function (time) {
            if (lastTime !== undefined) {
                let dt = (time - lastTime) / 1000;
    
                // Set the step parameters
                that.world.step(fixedTimeStep, dt, maxSubSteps)
    
                // Update the position of the currentObj in our scene to the position of the cannon flyingBody
                that.currentObj.transformValue.position = that.CANNONflyingBody.position;
                ////Diagnostics.log("-- flying body position: " + that.printVec3(that.CANNONflyingBody.position))
                ////Diagnostics.log("++ current obj position: " + that.printVec3(that.currentObj.worldTransformValue.position))

                /*
                that.currentObj.worldTransformValue.position.x = that.CANNONflyingBody.position.x;
                that.currentObj.worldTransformValue.position.y = that.CANNONflyingBody.position.y;
                that.currentObj.worldTransformValue.position.z = that.CANNONflyingBody.position.z;
                //Diagnostics.log("-- flying body position: " + that.printVec3(that.CANNONflyingBody.position))
                //Diagnostics.log("++ current obj position: " + that.printVec3(that.currentObj.worldTransformValue.position))

                */

                //that.currentObj.worldTransform.position = new Reactive.Vec3(that.CANNONflyingBody.position.x, that.CANNONflyingBody.position.y, that.CANNONflyingBody.position.z);
            }
    
            lastTime = time
        }, timeInterval);

    this.detectCollision = this.CANNONflyingBody.addEventListener("collide", function(e) {
      that.resetPhysics();
      // NOT WORKING - because I can't change an output or get the input value
      Patches.inputs.setBoolean('isGiftReady', true);
      that.detectCollision = null;
    })
  }
}

// TODO: improvement - I could have placed the variables in the constructor, and make the class work for other objects
const flyingObject = new FlyingObject();
export default flyingObject;