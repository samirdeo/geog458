// assign the access token
mapboxgl.accessToken =
    'pk.eyJ1Ijoic2FtaXJkIiwiYSI6ImNtbDRqcXZoOTBjZzQzZXBzbGdrMWh3ZWMifQ.vzQA6ML2uqK21KdFHvmlbw';

// declare the map object
let map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/mapbox/dark-v10',
    zoom: 11, // starting zoom
    minZoom: 10,
    center: [-122.33, 47.61] // starting center — Seattle
});

// declare the coordinated chart and other variables.
let collisionChart = null,
    injuries = {},
    numCollisions = 0;

// grades represent number of injuries: 0 = property damage only, 1 = injury, 2 = multiple injuries
const grades = [0, 1, 2],
    colors = ['rgb(208,209,230)', 'rgb(103,169,207)', 'rgb(1,108,89)'],
    radii = [5, 15, 20];

// create the legend object and anchor it to the html element with id legend.
const legend = document.getElementById('legend');

// set up legend grades content and labels
let labels = ['<strong>Injuries</strong>'], vbreak;

// iterate through grades and create a scaled circle and label for each
for (var i = 0; i < grades.length; i++) {
    vbreak = grades[i];
    dot_radii = 2 * radii[i];
    labels.push(
        '<p class="break"><i class="dot" style="background:' + colors[i] + '; width: ' + dot_radii +
        'px; height: ' +
        dot_radii + 'px; "></i> <span class="dot-label" style="top: ' + dot_radii / 2 + 'px;">' + vbreak +
        '</span></p>');
}

const source =
    '<p style="text-align: right; font-size:10pt">Source: <a href="https://data.seattle.gov">SDOT</a></p>';

// join all the labels and the source to create the legend content.
legend.innerHTML = labels.join('') + source;



// define the asynchronous function to load geojson data.
async function geojsonFetch() {

    // Await operator is used to wait for a promise.
    // An await can cause an async function to pause until a Promise is settled.
    let response;
    response = await fetch('assets/collisions.geojson');
    collisions = await response.json();



    //load data to the map as new layers.
    map.on('load', () => {

        // when loading a geojson, there are two steps:
        // add a source of the data and then add the layer out of the source
        map.addSource('collisions', {
            type: 'geojson',
            data: collisions
        });


        map.addLayer({
                'id': 'collisions-point',
                'type': 'circle',
                'source': 'collisions',
                'minzoom': 10,
                'paint': {
                    // increase the radius of the circle as INJURIES value increases
                    'circle-radius': {
                        'property': 'INJURIES',
                        'stops': [
                            [grades[0], radii[0]],
                            [grades[1], radii[1]],
                            [grades[2], radii[2]]
                        ]
                    },
                    // change the color of the circle as INJURIES value increases
                    'circle-color': {
                        'property': 'INJURIES',
                        'stops': [
                            [grades[0], colors[0]],
                            [grades[1], colors[1]],
                            [grades[2], colors[2]]
                        ]
                    },
                    'circle-stroke-color': 'white',
                    'circle-stroke-width': 1,
                    'circle-opacity': 0.6
                }
            },
            'waterway-label' // make the thematic layer above the waterway-label layer.
        );


        // click on each dot to view collision details in a popup
        map.on('click', 'collisions-point', (event) => {
            new mapboxgl.Popup()
                .setLngLat(event.features[0].geometry.coordinates)
                .setHTML(
                    `<strong>Type:</strong> ${event.features[0].properties.COLLISIONTYPE}<br>` +
                    `<strong>Injuries:</strong> ${event.features[0].properties.INJURIES}<br>` +
                    `<strong>Fatalities:</strong> ${event.features[0].properties.FATALITIES}<br>` +
                    `<strong>Location:</strong> ${event.features[0].properties.LOCATION}`
                )
                .addTo(map);
        });



        // the coordinated chart relevant operations

        // find the injury counts of all collisions in the displayed map view.
        injuries = calCollisions(collisions, map.getBounds());

        // enumerate the total number of collisions.
        numCollisions = injuries[0] + injuries[1] + injuries[2];

        // update the content of the element collision-count.
        document.getElementById("collision-count").innerHTML = numCollisions;

        // add "injuries" to the beginning of the x variable and "#" to the beginning of the y variable.
        x = Object.keys(injuries);
        x.unshift("injuries")
        y = Object.values(injuries);
        y.unshift("#")


        // generate the chart
        collisionChart = c3.generate({
            size: {
                height: 350,
                width: 460
            },
            data: {
                x: 'injuries',
                columns: [x, y],
                type: 'bar', // make a bar chart.
                colors: {
                    '#': (d) => {
                        return colors[d["x"]];
                    }
                },
                onclick: function (d) { // update the map and sidebar once the bar is clicked.
                    let floor = parseInt(x[1 + d["x"]]),
                        ceiling = floor + 1;
                    // filter the map to show only collisions in this injury range
                    map.setFilter('collisions-point',
                        ['all',
                            ['>=', 'INJURIES', floor],
                            ['<', 'INJURIES', ceiling]
                        ]);
                }
            },
            axis: {
                x: { // injury count
                    type: 'category',
                },
                y: { // number of collisions
                    tick: {
                        values: [200, 400, 600, 800]
                    }
                }
            },
            legend: {
                show: false
            },
            bindto: "#collision-chart" // bind the chart to the placeholder element "collision-chart".
        });

    });



    map.on('idle', () => {

        injuries = calCollisions(collisions, map.getBounds());
        numCollisions = injuries[0] + injuries[1] + injuries[2];
        document.getElementById("collision-count").innerHTML = numCollisions;

        x = Object.keys(injuries);
        x.unshift("injuries")
        y = Object.values(injuries);
        y.unshift("#")

        // after finishing each map reaction, the chart will be rendered in case the current bbox changes.
        collisionChart.load({
            columns: [x, y]
        });
    });
}

// call the geojson loading function
geojsonFetch();

function calCollisions(currentCollisions, currentMapBounds) {

    let injuryClasses = {
        0: 0,
        1: 0,
        2: 0
    };
    currentCollisions.features.forEach(function (d) { // d indicates a feature of currentCollisions
        // contains is a spatial operation to determine whether a point is within a bbox or not.
        if (currentMapBounds.contains(d.geometry.coordinates)) {
            // cap at 2 so all collisions with 2+ injuries fall in the same bucket
            injuryClasses[Math.min(Math.floor(d.properties.INJURIES), 2)] += 1;
        }
    })
    return injuryClasses;
}

// capture the element reset and add a click event to it.
const reset = document.getElementById('reset');
reset.addEventListener('click', event => {

    // this event will trigger the map fly to its origin location and zoom level.
    map.flyTo({
        zoom: 11,
        center: [-122.33, 47.61]
    });
    // also remove all the applied filters
    map.setFilter('collisions-point', null)

});
